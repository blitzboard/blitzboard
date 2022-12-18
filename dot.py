import json

with open('food.json', "r") as f:
  data = json.load(f)

print("""

digraph graph_name {
  graph [
    charset = "UTF-8",
    bgcolor = "#4A4A4A",
    rankdir = LR,
    margin = 0.2,
    layout = sfdp,
    K = 0.01
  ];
  node [
    shape = box,
    fontname = "Migu 1M",
    fontsize = 12,
    style = "solid, filled",
    fillcolor = "#EFEFEF"
  ];
  """
)

print(','.join([node['id'] for node in  data['nodes']]), end='')
print(";", end='')


for edge in data['edges']:
  print(f"{edge['from']}->{edge['to']};")
print("}")





# digraph graph_name {
#   graph [
#     charset = "UTF-8",
#     bgcolor = "#4A4A4A",
#     rankdir = LR,
#     margin = 0.2
#   ];
#   node [
#     shape = box,
#     fontname = "Migu 1M",
#     fontsize = 12,
#     style = "solid, filled",
#     fillcolor = "#EFEFEF"
#   ];
#
#    b1 [label = "第一次川中島の戦い\n1553年"];
#    b2 [label = "第二次川中島の戦い\n1555年"];
#    b3 [label = "厳島の戦い\n1555年"];
#    b4 [label = "第三次川中島の戦い\n1557年"];
#
#    b5 [label = "桶狭間の戦い\n1560年"];
#    b6 [label = "第四次川中島の戦い\n1561年"];
#    b7 [label = "三河一向一揆\n1563年"];
#    b8 [label = "第五次川中島の戦い\n1564年"];
#
#    b9 [label = "金ヶ崎の戦い\n1570年"];
#    b10 [label = "姉川の戦い\n1570年"];
#    b14 [label = "三方ヶ原の戦い\n1572年"];
#    b15 [label = "一乗谷の戦い\n1573年"];
#    b16 [label = "小谷城の戦い\n1573年"];
#    b17 [label = "長篠の戦い\n1573年"];
#    b18 [label = "七尾城の戦い\n1576年"];
#
#    b20 [label = "天正伊賀の乱\n1581年"];
#    b21 [label = "甲州征伐\n1582年"];
#    b22 [label = "本能寺の変\n1582年"];
#    b23 [label = "山崎の戦い\n1582年"];
#    b24 [label = "賤ヶ岳の戦い\n1583年"];
#    b25 [label = "小牧・長久手の戦い\n1584年"];
#    b27 [label = "羽柴秀吉の紀州攻め\n1585年"];
#    b28 [label = "羽柴勢の四国攻め\n1585年"];
#    b29 [label = "九州平定\n1587年"];
#
#    b30 [label = "小田原征伐\n1590年"];
#    b31 [label = "文禄の役\n1592年"];
#    b32 [label = "慶長の役\n1597年"];
#
#    b33 [label = "関ヶ原の役\n1600年"];
