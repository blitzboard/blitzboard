
from flask import Flask, send_file, request, Response, stream_with_context

from flask_cors import CORS
import json
import re
import os
import sys
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.docstore.document import Document
from openai import OpenAI
from langchain.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate
from typing import Dict
from langchain_core.pydantic_v1 import BaseModel, Field, create_model
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler



load_dotenv()

openai_client = OpenAI()

app = Flask(__name__, template_folder='templates')

CORS(app)

vector_db_path = os.getenv("VECTOR_STORE", "vector_store.faiss")

abstract_node_store_path = "abstract_node_store.faiss"

abstract_node_store = None

embeddings = OpenAIEmbeddings(model='text-embedding-3-small')

model_name = "gpt-4o"

if os.path.exists(abstract_node_store_path):
    abstract_node_store = FAISS.load_local(abstract_node_store_path, embeddings, allow_dangerous_deserialization=True)


article_dir = os.getenv("ARTICLE_DIR", "./articles")
# create article directory if not exists
if not os.path.exists(article_dir):
    os.makedirs(article_dir)

def find_by_metadata(
    faiss, filter) -> 'dict[str, Document]':
    if filter is None:
        return faiss.docstore._dict

    response = {
        key: item
        for key, item in faiss.docstore._dict.items()
        if all(item.metadata.get(k) == value for k, value in filter.items())
    }

    return response


chat_model = ChatOpenAI(
    model=model_name,
    temperature=0,
    max_tokens=None,
    streaming=True,
    timeout=None,
    max_retries=2,
)



#GET: /article?graphId=<グラフID>
@app.route('/article', methods=['GET'])
def article():
    graphId = request.args.get('graphId')
    file_path = os.path.join(article_dir, f"{graphId}.txt")
    if not os.path.exists(file_path):
        return ""
    with open(file_path, "r") as f:
        article = f.read()
    return article

@app.route('/article', methods=['DELETE'])
def delete_article():
    graphId = request.args.get('graphId')
    file_path = os.path.join(article_dir, f"{graphId}.txt")
    if os.path.exists(file_path):
        os.remove(file_path)

    embeddings = OpenAIEmbeddings(model='text-embedding-3-small')
    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(vector_db_path, embeddings, allow_dangerous_deserialization=True)

    if store is None:
        return json.dumps({"status": "not found"})
    else:
        ids_to_delete = find_by_metadata(store, {"graphId": graphId})
        if len(ids_to_delete.values()) > 0:
            store.delete(ids_to_delete)
    store.save_local(vector_db_path)
    return json.dumps({"status": "ok"})


@app.route('/register_article', methods=['POST'])
def register_article():
    # data format:
    # {
    # 	"graphId": 1,
    # 	"article": <記事の内容>,
    #   "words": [ 
    #     <単語群>
    #   ],
    # }

    data = request.get_json()
    # Register article to vector store with FAISS
    article = data['article']
    words = data['words']
    graphId = data['graphId']

    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(vector_db_path, embeddings, allow_dangerous_deserialization=True)

    # save article to file
    file_path = os.path.join(article_dir, f"{graphId}.txt")
    with open(file_path, "w") as f:
        f.write(article)

    # create documents from words
    documents = []
    for word in words:
        documents.append(Document(word, metadata=dict(graphId=graphId)))

    if store is None:
        store = FAISS.from_documents(documents, embeddings)
    else:
        # TODO: not to re-register same words to reduce cost of indexing
        ids_to_delete = find_by_metadata(store, {"graphId": graphId})
        if len(ids_to_delete.values()) > 0:
            store.delete(ids_to_delete)
        store.add_documents(documents)
    store.save_local(vector_db_path)
    return json.dumps({"status": "ok"})


@app.route('/register_abstract_nodes', methods=['POST'])
def register_abstract_nodes():
    # data format of nodes:
    #  [
    #    {
    #     "name": "node1",
    #     "properties": {
    #       "property1": "description1",
    #       "property2": "description2",
    #       ...
    #     }
    #   },
    #   ...
    # ]

    data = request.get_json()["nodes"]
    documents = []
    for node_definition in data:
        documents.append(Document(node_definition['name'], metadata=node_definition['properties']))

    abstract_node_store = FAISS.from_documents(documents, embeddings)
    abstract_node_store.save_local(abstract_node_store_path)
    return json.dumps({"status": "ok"})

def retrieve_from_abstract_node_store(node_name, k=1):
    if abstract_node_store is None:
        return []
    return abstract_node_store.similarity_search_with_score(node_name, k=k)


@app.route('/similar_node', methods=['GET'])
def similar_node():
    # GET: /similar_node?node=<ノード名>
    # ノード名に類似するノードを取得する

    # Wordnet使えるかも
    node = request.args.get('node')
    nearest = retrieve_from_abstract_node_store(node)
    if len(nearest) == 0:
        return json.dumps({})
    nearest = nearest[0]
    return json.dumps({"name": nearest[0].page_content, "distance": float(nearest[1]), "properties": nearest[0].metadata}, ensure_ascii=False)

@app.route('/extract_missing_props', methods=['POST'])
def extract_missing_props():
    data = request.get_json()
    node_name = data['node']
    props = data['props']
    article = data['article']
    system_prompt = f"""
# 命令: 
ユーザが災害に関する記事を入力するので、{ node_name }に関するプロパティを抽出してください。

# 対象プロパティ
{ props }
"""
    fields = {prop: (str, Field(description=f"Field for {prop}")) for prop in props}
    ExtractedProps = create_model('ExtractedProps', **fields)
    response = Response(gpt_stream(ExtractedProps, system_prompt, article), mimetype='text/event-stream')
    return response



@app.route('/extract_missing_nodes', methods=['POST'])
def extract_missing_nodes():
    data = request.get_json()
    existing_nodes = data['existing_nodes']
    article = data['article']

    # まずは記事からすべての名詞句を抽出
    system_prompt = f"""
# 命令: 
与えられる文章から、名詞句をすべて抽出してリストにしてください。
"""
    class NounPhraseList(BaseModel):
        noun_phrases: list[str] = Field(description="The list of noun phrases")

    phrase_result = gpt_synchronous(NounPhraseList, system_prompt, article)

    # 次に、各名詞句に対して類似するノードを抽象グラフから抽出
    threshold = 0.5
    missing_nodes = []
    for phrase in phrase_result.noun_phrases:
        nearest = retrieve_from_abstract_node_store(phrase)
        if len(nearest) > 0:            
            nearest = nearest[0]
            node_name = nearest[0].page_content
            if nearest[1] < threshold and node_name not in existing_nodes and node_name not in [n['name'] for n in missing_nodes]:
                print(f"Found missing node from {phrase}: {node_name}")
                missing_nodes.append({"name": node_name, "properties": nearest[0].metadata, "original_phrase": phrase})

    # プロパティの抽出

    for node in missing_nodes:            
        props = list(node['properties'].keys())
        system_prompt = f"""
# 命令: 
ユーザが災害に関する記事を入力するので、{ node['name'] }に関するプロパティを抽出してください。

# 対象プロパティ
{ props }
    """
        fields = {prop: (str, Field(description=f"Field for {prop}")) for prop in props}
        ExtractedProps = create_model('ExtractedProps', **fields)
        response = gpt_synchronous(ExtractedProps, system_prompt, article)
        node['properties'] = response.dict()

        # Remove prop whose value is empty
        node['properties'] = {prop: value for prop, value in node['properties'].items() if value}
    return json.dumps(missing_nodes)




@app.route('/related_words', methods=['POST'])
def related_words():
    # GET: /related_words?article=<記事の内容>
    # 記事をチャンクへ分割→関連のあるワードを取得する
    # data format:
    # [
    #   {
    #     word: "word1",
    #     graphId: 1,
    #     distance: 0.9,
    # 	},
    #   ...
    # ]


    data = request.get_json()

    max_len = 30
    max_distance = 1.3
    chunks_num = 5

    article = data['article']
    embeddings = OpenAIEmbeddings(model='text-embedding-3-small')
    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(vector_db_path, embeddings, allow_dangerous_deserialization=True)
    # split article to chunks by chunks_num. each chunk should have same length
    chunk_len = len(article) // chunks_num
    chunks = [article[i * chunk_len:(i+1) * chunk_len] for i in range(0, chunks_num)]        

    nearest_list = []
    for chunk in chunks:
        chunk = chunk.strip()
        if len(chunk) == 0:
            continue
        nearest_list += store.similarity_search_with_score(chunk, k=20, fetch_k=20)
        # make unique
        nearest_list = list({n[0].page_content: n for n in nearest_list}.values())
        nearest_list = list(filter(lambda n: n[1] < max_distance, nearest_list))
    result = []
    # sort by distance
    nearest_list.sort(key=lambda x: x[1])
    nearest_list = nearest_list[:max_len]

    for n in nearest_list:
        result.append({"word": n[0].page_content, "graphId": n[0].metadata['graphId'], "distance": float(n[1])})
    return json.dumps(result)


def gpt_stream(output_class, system_prompt, user_prompt):

    parser = PydanticOutputParser(pydantic_object=output_class)

    generator = openai_client.chat.completions.create(model=model_name,
        messages = [
            { "role": "system", "content": system_prompt + "\n" + parser.get_format_instructions() }, 
            { "role": "user", "content": user_prompt }
        ],
        response_format={"type": "json_object"},
    stream=True)

    print(parser.get_format_instructions(), file=sys.stderr)

    for chunk in generator:
        if chunk.choices[0].finish_reason is None:
            stream_token = chunk.choices[0].delta.content
            yield stream_token

def gpt_synchronous(output_class, system_prompt, user_prompt):
    parser = PydanticOutputParser(pydantic_object=output_class)

    completion = openai_client.chat.completions.create(model=model_name,
        messages = [
            { "role": "system", "content": system_prompt + "\n" + parser.get_format_instructions() }, 
            { "role": "user", "content": user_prompt }
        ],
        response_format={"type": "json_object"})

    return parser.parse(completion.choices[0].message.content)
    

@app.route('/extract_events', methods=['POST'])
def extract_events():
    system_prompt = """
# タスク説明 
災害のニュース記事からナレッジグラフを作ろうとしています。
まずはナレッジグラフのノードを列挙するため、災害と、その原因、引き起こされた被害を個別のイベントとしてなるべく多く抜き出し、イベントの配列を作ってください。
各イベントの名前は、一般的な事象を表すものにしてください。例えば「台風」「洪水」「土砂崩れ」などといったものです。
また、各イベントに関するプロパティも抜き出してください。例えば、台風の場合は「風速」「被害状況」「固有名」などがプロパティとして考えられます。
抽出結果はナレッジグラフのノードとして扱われるため、各イベントの原因や結果はプロパティに含めないでください。
さらに各事象に対して、元のニュース記事のどのフレーズから抜き出したのかを明示してください。
"""
    user_prompt = request.json["query"]
    sample_events = request.json["sampleEvents"]
    # system_prompt += sample_events
    class Event(BaseModel):
        name: str = Field(description="The event name")
        properties: Dict[str, str] = Field(description="The properties of the event")
        original_phrase: str = Field(description="The original phrase from the news article")
    class EventExtractionResult(BaseModel):
        events: list[Event] = Field(description="The extracted events")
    response = Response(gpt_stream(EventExtractionResult, system_prompt, user_prompt), mimetype='text/event-stream')
    return response

@app.route('/extract_relations', methods=['POST'])
def extract_relations():
    system_prompt = """
# 命令: 
災害時の事象間の連鎖関係に関するナレッジグラフを作成しようと思っています。
{{ 事象リスト }}と、災害の {{ ニュース記事 }}を与えるので、
ニュース記事の中に「{{原因事象}} -> {{結果事象}}」のような因果関係が含まれる場合は、その因果関係を抽出してください。

# その他の制約条件: 
* 与えられた事象リストに含まれていない事象は、出力に含めないようにしてください。
"""
    user_prompt = request.json["query"]
    class Event(BaseModel):
        cause: str = Field(description="The cause event")
        result: str = Field(description="The result event")
        # original_phrase: str = Field(description="The original phrase from the news article")
    class RelationExtractionResult(BaseModel):
        relations: list[Event] = Field(description="The extracted relations")
    response = Response(gpt_stream(RelationExtractionResult, system_prompt, user_prompt), mimetype='text/event-stream')
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
