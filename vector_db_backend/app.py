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
from pydantic import BaseModel, Field, create_model
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain_text_splitters import RecursiveCharacterTextSplitter
import extract_graphs

load_dotenv()

openai_client = OpenAI()

app = Flask(__name__, template_folder="templates")

CORS(app)

vector_db_path = os.getenv("VECTOR_STORE", "vector_store.faiss")

abstract_node_store_path = "abstract_node_store.faiss"

abstract_node_store = None

abstract_edge_store_path = "abstract_edge_store.json"

abstract_edge_store = None

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

base_model_name = "o3-mini"

if os.path.exists(abstract_node_store_path):
    abstract_node_store = FAISS.load_local(
        abstract_node_store_path, embeddings, allow_dangerous_deserialization=True
    )

if os.path.exists(abstract_edge_store_path):
    with open(abstract_edge_store_path, "r") as f:
        abstract_edge_store = json.load(f)

article_dir = os.getenv("ARTICLE_DIR", "./articles")
# create article directory if not exists
if not os.path.exists(article_dir):
    os.makedirs(article_dir)


def quote_if_needed(value):
    if " " in value or ":" in value:
        return f'"{value}"'
    return value


def node_to_line(node):
    node_name = node["id"]
    labels = node["labels"]
    properties = node["properties"]
    if labels is None:
        labels = []
    if properties is None:
        properties = {}

    content = quote_if_needed(node_name)
    for label in labels:
        content += f" :{quote_if_needed(label)}"
    for key, value in properties.items():
        if isinstance(value, list):
            for item in value:
                content += f" {quote_if_needed(key)}:{quote_if_needed(item)}"
        else:
            content += f" {quote_if_needed(key)}:{quote_if_needed(value)}"
    return content


def find_by_metadata(faiss, filter) -> "dict[str, Document]":
    if filter is None:
        return faiss.docstore._dict

    response = {
        key: item
        for key, item in faiss.docstore._dict.items()
        if all(item.metadata.get(k) == value for k, value in filter.items())
    }

    return response


# GET: /article?graphId=<グラフID>
@app.route("/article", methods=["GET"])
def article():
    graphId = request.args.get("graphId")
    file_path = os.path.join(article_dir, f"{graphId}.txt")
    if not os.path.exists(file_path):
        return ""
    with open(file_path, "r") as f:
        article = f.read()
    return article


@app.route("/article", methods=["DELETE"])
def delete_article():
    graphId = request.args.get("graphId")
    file_path = os.path.join(article_dir, f"{graphId}.txt")
    if os.path.exists(file_path):
        os.remove(file_path)

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(
            vector_db_path, embeddings, allow_dangerous_deserialization=True
        )

    if store is None:
        return json.dumps({"status": "not found"})
    else:
        ids_to_delete = find_by_metadata(store, {"graphId": graphId})
        if len(ids_to_delete.values()) > 0:
            store.delete(ids_to_delete)
    store.save_local(vector_db_path)
    return json.dumps({"status": "ok"})


@app.route("/register_article", methods=["POST"])
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
    article = data["article"]
    words = data["words"]
    graphId = data["graphId"]

    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(
            vector_db_path, embeddings, allow_dangerous_deserialization=True
        )

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


@app.route("/register_abstract_nodes", methods=["POST"])
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
    # data format of edges:
    # [
    #   {
    #     "from": "node1",
    #     "to": "node2",
    #     "properties": {
    #       "property1": "description1",
    #       "property2": "description2",
    #       ...
    #     }
    #   },
    #   ...
    # ]

    global abstract_node_store, abstract_edge_store

    data = request.get_json()["nodes"]
    documents = []
    for node_definition in data:
        documents.append(
            Document(node_definition["name"], metadata=node_definition["properties"])
        )

    # By default, L2 distance is used in FAISS
    abstract_node_store = FAISS.from_documents(documents, embeddings)
    abstract_node_store.save_local(abstract_node_store_path)

    edges = request.get_json()["edges"]
    with open(abstract_edge_store_path, "w") as f:
        json.dump(edges, f, ensure_ascii=False)
    abstract_edge_store = edges
    return json.dumps({"status": "ok"})


def retrieve_from_abstract_node_store(node_name, k=1):
    if abstract_node_store is None:
        return []
    return abstract_node_store.similarity_search_with_score(node_name, k=k)


def check_node_matching(abstract_node_name, instance_node_description):
    prompt = f"""
# 命令: 
以下に「一般的な事象の名前」と、「個別の事象の説明」を与えるので、「個別の事象」が「一般的な事象」に含まれるかどうかを判定してください。
含まれる場合には「yes」、含まれない場合には「no」と入力してください。

# 一般的な事象の名前
{abstract_node_name}

# 個別の事象の説明
{instance_node_description}
"""
    print(prompt, file=sys.stderr)

    class MatchingResult(BaseModel):
        result: str = Field(description="The result of matching. 'yes' or 'no'")

    res = gpt_synchronous(prompt, None, MatchingResult)
    return res.result == "yes"


@app.route("/search_matched_nodes", methods=["POST"])
def search_matched_nodes():
    # GET: /search_matched_nodes?node=<ノード名>
    # ノード名に類似するノード群を、置換候補として返す

    # TODO: Wordnet使えるかも
    node = request.get_json()
    node_text = node["id"]
    for k, v in node["properties"].items():
        if isinstance(v, list):
            for item in v:
                node_text += " " + k + ":" + item
        else:
            node_text += " " + k + ":" + v

    print(node_text, file=sys.stderr)
    nearest = retrieve_from_abstract_node_store(node_text, k=5)
    if len(nearest) == 0:
        return json.dumps({})
    print(nearest, file=sys.stderr)
    threshold = 1.0
    epsilon = 0.0001
    nearest = [n for n in nearest if n[1] < threshold]
    matched_nodes = []
    for n in nearest:
        if n[1] < epsilon or check_node_matching(n[0].page_content, node_to_line(node)):
            matched_nodes.append(
                {
                    "name": n[0].page_content,
                    "distance": float(n[1]),
                    "properties": n[0].metadata,
                }
            )
            if n[0].page_content == node["id"]:
                # Stop searching if the exact match is found
                break
    return json.dumps(matched_nodes, ensure_ascii=False)


@app.route("/extract_missing_props", methods=["POST"])
def extract_missing_props():
    data = request.get_json()
    node_name = data["node"]
    props = data["props"]
    article = data["article"]
    system_prompt = f"""
# 命令: 
ユーザが災害に関する記事を入力するので、{ node_name }に関するプロパティを抽出してください。

# 対象プロパティ
{ props }
"""
    fields = {prop: (str, Field(description=f"Field for {prop}")) for prop in props}
    ExtractedProps = create_model("ExtractedProps", **fields)
    response = Response(
        gpt_stream(system_prompt, article, ExtractedProps), mimetype="text/event-stream"
    )
    return response


@app.route("/extract_missing_nodes", methods=["POST"])
def extract_missing_nodes():
    data = request.get_json()
    existing_nodes = data["existing_nodes"]
    article = data["article"]

    # まずは記事からすべての名詞句を抽出
    #     system_prompt = f"""
    # # 命令:
    # 与えられる文章から、名詞句をすべて抽出してリストにしてください。
    # """
    #     class NounPhraseList(BaseModel):
    #         noun_phrases: list[str] = Field(description="The list of noun phrases")

    #     phrase_result = gpt_synchronous(NounPhraseList, system_prompt, article)

    text_splitter = RecursiveCharacterTextSplitter(
        separators=[
            "\n\n",
            "。",
        ],
        chunk_size=50,
        chunk_overlap=10,
        is_separator_regex=False,
    )
    text_chunks = text_splitter.create_documents([article])

    print(text_chunks, file=sys.stderr)

    # 次に、各名詞句に対して類似するノードを抽象グラフから抽出
    threshold = 0.5
    missing_nodes = []
    for chunk in text_chunks:
        nearest = retrieve_from_abstract_node_store(chunk.page_content, k=3)
        print(chunk, file=sys.stderr)
        print(nearest, file=sys.stderr)
        for nearest_node in nearest:
            node_name = nearest_node[0].page_content
            if (
                nearest_node[1] < threshold
                and node_name not in existing_nodes
                and node_name not in [n["name"] for n in missing_nodes]
            ):
                print(f"Found missing node from {chunk.page_content}: {node_name}")
                missing_nodes.append(
                    {
                        "name": node_name,
                        "properties": nearest[0].metadata,
                        "original_phrase": chunk.page_content,
                    }
                )

    # プロパティの抽出

    for node in missing_nodes:
        props = list(node["properties"].keys())
        system_prompt = f"""
# 命令: 
ユーザが災害に関する記事を入力するので、{ node['name'] }に関するプロパティを抽出してください。

# 対象プロパティ
{ props }
    """
        fields = {prop: (str, Field(description=f"Field for {prop}")) for prop in props}
        ExtractedProps = create_model("ExtractedProps", **fields)
        response = gpt_synchronous(system_prompt, article, ExtractedProps)
        node["properties"] = response.dict()

        # Remove prop whose value is empty
        node["properties"] = {
            prop: value for prop, value in node["properties"].items() if value
        }
    return json.dumps(missing_nodes)


@app.route("/related_words", methods=["POST"])
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

    article = data["article"]
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    store = None
    if os.path.exists(vector_db_path):
        store = FAISS.load_local(
            vector_db_path, embeddings, allow_dangerous_deserialization=True
        )
    # split article to chunks by chunks_num. each chunk should have same length
    chunk_len = len(article) // chunks_num
    chunks = [
        article[i * chunk_len : (i + 1) * chunk_len] for i in range(0, chunks_num)
    ]

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
        result.append(
            {
                "word": n[0].page_content,
                "graphId": n[0].metadata["graphId"],
                "distance": float(n[1]),
            }
        )
    return json.dumps(result)


@app.route("/edges_between_nodes", methods=["POST"])
def edges_between_nodes():
    data = request.get_json()
    nodes = data["nodes"]
    if abstract_edge_store is None:
        return json.dumps([])
    result = []
    for edge in abstract_edge_store:
        if edge["from"] in nodes and edge["to"] in nodes:
            result.append(edge)
    return json.dumps(result)


def gpt_stream(system_prompt, user_prompt=None, output_class=None, model=None):
    if model is None:
        model = base_model_name

    if output_class:
        parser = PydanticOutputParser(pydantic_object=output_class)
        system_prompt += "\n" + parser.get_format_instructions()

    messages = [
        {"role": "system", "content": system_prompt},
    ]
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})

    generator = openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0,
        seed=42,
        response_format={"type": "json_object"},
        stream=True,
    )

    for chunk in generator:
        print(chunk.choices[0], file=sys.stderr)
        if chunk.choices[0].finish_reason is None:
            stream_token = chunk.choices[0].delta.content
            yield stream_token


def gpt_synchronous(system_prompt, user_prompt=None, output_class=None, model=None):
    if model is None:
        model = base_model_name

    if output_class:
        parser = PydanticOutputParser(pydantic_object=output_class)
        system_prompt += "\n" + parser.get_format_instructions()

    messages = [
        {"role": "system", "content": system_prompt},
    ]
    if user_prompt:
        messages = [{"role": "user", "content": user_prompt}]

    arguments = {
        "model": model,
        "messages": messages,
        "seed": 42,
    }

    if not model.startswith("o1"):
        arguments["temperature"] = 0

    if output_class:
        arguments["response_format"] = {"type": "json_object"}
        completion = openai_client.chat.completions.create(**arguments)
        return parser.parse(completion.choices[0].message.content)
    else:
        completion = openai_client.chat.completions.create(**arguments)
        return completion.choices[0].message.content


def convert_graph_to_json(graph):
    nodes = []
    for node in graph.nodes:
        properties = {}
        for prop in node.properties:
            if prop.name in properties:
                properties[prop.name].append(prop.value)
            else:
                properties[prop.name] = [prop.value]
        nodes.append(
            {
                "id": node.name,
                "labels": [],
                "properties": properties,
            }
        )

    edges = []
    for edge in graph.edges:
        edges.append(
            {
                "from": edge.source,
                "to": edge.target,
                "labels": [],
                "properties": {},
            }
        )

    return {"nodes": nodes, "edges": edges}


def convert_json_to_graph(json_graph):

    nodes = []
    edges = []
    for node in json_graph["nodes"]:
        nodes.append(
            extract_graphs.Node(
                name=node["id"],
                properties=[
                    extract_graphs.Property(name=k, value=v[0])
                    for k, v in node["properties"].items()
                ],
            )
        )
    for edge in json_graph["edges"]:
        edges.append(
            extract_graphs.Edge(
                source=edge["from"],
                target=edge["to"],
                properties=[
                    extract_graphs.Property(name=k, value=v[0])
                    for k, v in edge["properties"].items()
                ],
            )
        )
    graph = extract_graphs.Graph(nodes=nodes, edges=edges)
    return graph


@app.route("/extract_instance_graph", methods=["POST"])
def extract_instance_graph():
    article = request.json.get("article")
    metagraph = request.json.get("metagraph")

    instance_graph = extract_graphs.extract_instance_graph(
        article, convert_json_to_graph(metagraph)
    )
    return convert_graph_to_json(instance_graph)


@app.route("/update_metagraph", methods=["POST"])
def update_metagraph():
    instance_graph = convert_json_to_graph(request.json.get("instance_graph"))
    metagraph = convert_json_to_graph(request.json.get("metagraph"))

    instance_metagraph = extract_graphs.extract_metagraph(metagraph, instance_graph)

    print(instance_metagraph, file=sys.stderr)
    if metagraph:
        metagraph = extract_graphs.merge_metagraph(instance_metagraph, metagraph)
    else:
        metagraph = instance_metagraph

    return convert_graph_to_json(metagraph)


@app.route("/extract_events", methods=["POST"])
def extract_events():
    system_prompt = """
# タスク説明
* 災害のニュース記事から、災害と、その原因、引き起こされた被害をそれぞれイベントとして抽出し、それらの因果関係も抽出してください。
* 各イベントの名前は、一般的な事象を表すものにしてください。
  * イベント名の例:「台風」「洪水」「大雨」「土砂崩れ」「工場の停止」「商店の休業」「鉄道の運休」など
  * 同時に、イベントのプロパティも抽出してください。
    * 例えば、台風の場合は「風速:20m/s以上」「固有名:台風21号」「上陸場所:沖縄県」などがプロパティとして考えられます。
  * 固有名詞や地名などはイベント名に含めず、イベントのプロパティとして抽出してください。
* 抽出結果はナレッジグラフのノードとして扱われるため、各イベントの原因や結果となる事象はプロパティに含めず、別途イベントとして抽出してください。
  * 抽出する単位はできるだけ細かくして、イベントの連鎖関係の解析に役立つようにしてください。例えば、台風によって引き起こされる「高潮」「強風」「大雨」などはすべて別のイベントとして抽出してください。
* 災害でも被害でも無い事象は抽出しないでください。  
* さらに各イベントに対して、元のニュース記事のどのフレーズから抜き出したのかを明示してください。
"""
    user_prompt = request.json["query"]

    class Event(BaseModel):
        name: str = Field(description="The event name")
        properties: Dict[str, str] = Field(description="The properties of the event")
        original_phrase: str = Field(
            description="The original phrase from the news article"
        )

    class EventExtractionResult(BaseModel):
        events: list[Event] = Field(description="The extracted events")
        relations: dict[str, str] = Field(description="The extracted relations")

    response = Response(
        gpt_stream(system_prompt, user_prompt, EventExtractionResult),
        mimetype="text/event-stream",
    )
    return response


@app.route("/extract_relations", methods=["POST"])
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

    response = Response(
        gpt_stream(system_prompt, user_prompt, RelationExtractionResult),
        mimetype="text/event-stream",
    )
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
