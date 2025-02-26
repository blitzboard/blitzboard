import argparse
import csv
import os
import sys
import traceback
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.docstore.document import Document
from typing import Dict, List
from pydantic import BaseModel, Field
from langchain_community.callbacks.manager import get_openai_callback

model_name = "o3-mini-2025-01-31"

load_dotenv(override=True)

chat_model = ChatOpenAI(model=model_name)


class Property(BaseModel):
    name: str = Field(..., description="Property name")
    value: str = Field(..., description="Property value")


class Node(BaseModel):
    name: str = Field(..., description="Node name")
    properties: List[Property] = Field(..., description="Node properties")


class Edge(BaseModel):
    source: str = Field(..., description="Source node name")
    target: str = Field(..., description="Target node name")


class Graph(BaseModel):
    nodes: List[Node] = Field(..., description="List of nodes")
    edges: List[Edge] = Field(..., description="List of edges")


class Metanode(Node):
    instance: List[str] = Field(..., description="List of instance node names")


class Metagraph(BaseModel):
    nodes: List[Metanode] = Field(..., description="List of metanodes")
    edges: List[Edge] = Field(..., description="List of edges")


system_prompt = """
# 役割
あなたは自然災害に関連する記事からナレッジグラフを抽出するAIです。
ナレッジグラフにはインスタンスグラフとメタグラフがあります。
インスタンスグラフは記事の内容に基づいて作成され、メタグラフはインスタンスグラフの共通点を抽出したものです。
メタグラフは、多数の記事の情報を要約したものとして、新しいインスタンスグラフの作成に役立ちます。

# ノード名について
記事に含まれる災害や被害といった事象をノード名として、なるべく多く抜き出してください。
災害とそれによって引き起こされる被害は、それぞれ別のノードにしてください。
企業名や地名、人名は事象ではないため、単体でノード名にすることは避けてください。
代わりに「長雨(東京)」のように、「ノード名(条件)」という形式を使います。
条件が存在しない場合は、単にノード名を記載します。
良い例：「長雨(東京)」、「台風(台風10号)」、「企業活動の停止」、「空港の閉鎖」、「鉄道の運休」
悪い例：「企業」、「空港」、「鉄道」、「神奈川」
"""

example_graph_path = os.path.join(os.path.dirname(__file__), "example_graph.json")

with open(example_graph_path, "r") as f:
    example_graph = f.read()


def quote_if_needed(value):
    if " " in value or ":" in value:
        return f'"{value}"'
    return value


def node_to_line(node):
    node_name = node.name
    labels = []
    properties = node.properties
    if labels is None:
        labels = []
    if properties is None:
        properties = {}

    content = quote_if_needed(node_name)
    for label in labels:
        content += f" :{quote_if_needed(label)}"
    for key, value in properties:
        content += f" {quote_if_needed(key[1])}:{quote_if_needed(value[1])}"
    return content


def edge_to_line(edge):
    source = edge.source
    target = edge.target

    content = f"{quote_if_needed(source)} -> {quote_if_needed(target)}"
    return content


def graph_to_text(graph):
    if graph is None:
        return ""
    nodes = graph.nodes
    edges = graph.edges

    content = ""
    for node in nodes:
        content += node_to_line(node) + "\n"
    for edge in edges:
        content += edge_to_line(edge) + "\n"
    return content


def extract_instance_graph(article, metagraph, without_metagraph=False):
    prompt = f"""
# タスクの説明
今回のタスクは、対象の記事の内容に相当するインスタンスグラフを作成することです。

"""

    if not without_metagraph:
        if metagraph:
            prompt += f"""グラフの作成に際して、次のメタグラフの語彙を参考にしてください。
必要に応じてここに含まれない語彙も記事から抽出してください。
また、抽出する語彙の属性は必ず具体的なものにしてください。

# メタグラフの語彙
{", ".join([node.name for node in metagraph.nodes])}
    """
        else:
            prompt += f"""グラフの作成に際して、次のグラフを例として参考にしてください。

# インスタンスグラフの例(記法だけ参考にして、内容は無視してよい)
{ example_graph }
"""

    prompt += f"""
# 対象の記事
{article}
"""

    print("system_prompt:", system_prompt, file=sys.stderr)
    print("prompt:", prompt, file=sys.stderr)

    structured_chat_model = chat_model.with_structured_output(Graph)
    instance_graph = structured_chat_model.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
    )

    print("instance_graph:\n\n", graph_to_text(instance_graph), file=sys.stderr)
    return instance_graph


def extract_metagraph(current_metagraph, instance_graph):
    prompt = f"""# タスクの説明
今回のタスクはインスタンスグラフからメタグラフを抽出することです。
特に、インスタンスグラフに含まれる具体的な属性を、抽象的な属性に置き換えてください。
例：
* 「長雨(東京)」と「長雨(大阪)」がある場合、「長雨(地域)」という抽象的な属性に置き換える。
* 「台風(台風21号)」と「台風(台風22号)」がある場合、「台風(固有名)」という抽象的な属性に置き換える。

ノードのプロパティに関しては、そのままコピーしてください。
"""
    #     if current_metagraph:
    #         prompt += f"""メタグラフの例を参考にしてください。

    # # メタグラフの例（記法だけ参考にして、内容は無視してよい）
    # {current_metagraph.json()}
    # """

    if current_metagraph:
        prompt += f"""メタグラフのノード名の例を参考にしてください。
# メタグラフのノード名の例
{", ".join([node.name for node in current_metagraph.nodes])}
"""
    else:
        prompt += f"""# メタグラフのノード名の例
長雨(地域)、塩害、工場の停止(地域)、値上がり(品名)
"""

    prompt += f"""

# 対象のインスタンスグラフ
{instance_graph.json()}
"""
    print("prompt to extract metagraph:", prompt, file=sys.stderr)

    structured_chat_model = chat_model.with_structured_output(Metagraph)
    metagraph = structured_chat_model.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
    )

    for metanode in metagraph.nodes:
        prop = metanode.properties
        for node in metanode.instance:
            if not any(node == p.value and p.name == "インスタンス" for p in prop):
                metanode.properties.append(Property(name="インスタンス", value=node))
    return metagraph


# 与えられたデータに対して、各記事ごとにグラフを抽出してメタグラフを更新する工程を繰り返す関数
def extract_graphs(data, callback_for_each_row=None, without_metagraph=False):
    metagraph = None  # 初期状態ではメタグラフは未定義
    data = data.copy()
    try:
        for idx, row in enumerate(data, start=1):
            article = row.get("本文")
            if not article:
                print(
                    f"行 {idx}: 記事本文が見つかりません。スキップします。",
                    file=sys.stderr,
                )
                continue

            print(f"行 {idx}: インスタンスグラフを抽出中...", file=sys.stderr)
            instance_graph = extract_instance_graph(
                article, metagraph, without_metagraph
            )
            if not instance_graph:
                print(
                    f"行 {idx}: インスタンスグラフの抽出に失敗しました。",
                    file=sys.stderr,
                )
                continue

            print(f"行 {idx}: メタグラフを更新中...", file=sys.stderr)
            if without_metagraph:
                instance_metagraph = None
            else:
                instance_metagraph = extract_metagraph(metagraph, instance_graph)

            if metagraph:
                metagraph = merge_metagraph(instance_metagraph, metagraph)
            else:
                metagraph = instance_metagraph

            if not metagraph and not without_metagraph:
                print(f"行 {idx}: メタグラフの更新に失敗しました。", file=sys.stderr)

            row["instance_graph"] = instance_graph
            row["inctance_metagraph"] = instance_metagraph
            row["metagraph"] = metagraph
            row["instance_graph_text"] = graph_to_text(instance_graph)
            row["instance_metagraph_text"] = graph_to_text(instance_metagraph)
            row["metagraph_text"] = graph_to_text(metagraph)
            if callback_for_each_row:
                callback_for_each_row(data)
    except Exception as e:
        print("エラーが発生しました:", e, file=sys.stderr)
        traceback.print_exc()
    return data


def check_node_matching(node1, node2):
    prompt = f"""
# 命令
事象1と事象2が同じ事象を指しているかどうかを判定してください。
例えば、「豪雨」と「大雨」は同じ事象です。
同じ事象を指していると判断できる場合は「yes」、そうでない場合には「no」と入力してください。

# 事象1
{node1}

# 事象2
{node2}
"""
    print(prompt, file=sys.stderr)

    class MatchingResult(BaseModel):
        result: str = Field(description="The result of matching. 'yes' or 'no'")

    structured_chat_model = chat_model.with_structured_output(MatchingResult)

    res = structured_chat_model.invoke(
        [
            {"role": "system", "content": prompt},
        ],
    )
    return res.result == "yes"


def merge_metagraph(new_metagraph, current_metagraph):
    documents = []
    for node in current_metagraph.nodes:
        documents.append(Document(node.name, metadata={}))

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    node_store = FAISS.from_documents(documents, embeddings)
    threshold = 0.5

    metagraph = current_metagraph.copy()

    for node in new_metagraph.nodes:
        nearest = node_store.similarity_search_with_score(node.name, k=1)[0]
        print("Name:", nearest[0].page_content, " Distance:", nearest[1])
        if (
            nearest[0].page_content == node.name
            or nearest[1] < threshold
            and check_node_matching(nearest[0].page_content, node.name)
        ):
            print(f"Unify {nearest[0].page_content} with {node.name}")
            existing_node = next(
                node
                for node in current_metagraph.nodes
                if node.name == nearest[0].page_content
            )
            # Merge properties
            for prop in node.properties:
                if prop not in existing_node.properties:
                    existing_node.properties.append(prop)
            print("Merged properties:", existing_node.properties)
            documents.append(Document(existing_node.name, metadata={}))
            for edge in new_metagraph.edges:
                if edge.source == node.name:
                    edge.source = existing_node.name
                if edge.target == node.name:
                    edge.target = existing_node.name
        else:
            metagraph.nodes.append(node)
            documents.append(Document(node.name, metadata={}))

    # Merge edges
    for edge in new_metagraph.edges:
        if edge not in metagraph.edges:
            metagraph.edges.append(edge)
    return metagraph


if __name__ == "__main__":
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument("--input_csv", type=str, required=True)
    arg_parser.add_argument("--output_csv", type=str, required=True)
    arg_parser.add_argument("--without_metagraph", action="store_true")
    arg_parser.add_argument("--limit", type=int, default=None)
    args = arg_parser.parse_args()

    with get_openai_callback() as cb:
        try:
            reader = csv.DictReader(open(args.input_csv))
            input_data = [row for row in reader]
            if args.limit:
                input_data = input_data[: args.limit]

            def callback_for_write(data):
                output_csv = csv.DictWriter(
                    open(args.output_csv, "w"), fieldnames=data[0].keys()
                )
                output_csv.writeheader()
                for row in data:
                    output_csv.writerow(row)

            output_data = extract_graphs(
                input_data, callback_for_write, args.without_metagraph
            )
            callback_for_write(output_data)
        except Exception as e:
            print("エラーが発生しました:", e, file=sys.stderr)
            traceback.print_exc()
        finally:
            print(cb, file=sys.stderr)
