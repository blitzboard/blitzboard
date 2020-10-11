# HelloGraph
HelloGraph is a simple application that can be used as a prototype for your own graph visualization tool.

## Usage

Download hellograph-master.zip

[![button_download](https://user-images.githubusercontent.com/4862919/85917710-79b99780-b897-11ea-800e-cbdc10268437.png)](https://github.com/g2glab/hellograph/archive/master.zip)

Open hellograph.html in your web browser.
    
Upload your json-pg file on the web browser (the .json files in examples/ may be good examples!).


### Full-text search in Neo4j

To query all properties of nodes, first list up all properties and labels by:

```
MATCH (n) UNWIND labels(n) as label MATCH (n2) UNWIND keys(n2) as key  RETURN collect(DISTINCT label), collect(DISTINCT key)
```

Using the list of properties and labels, execute:

```
CALL db.index.fulltext.createNodeIndex('allProperties', <List of labels>, <List of properties>)
```
