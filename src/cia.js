function computeCrossImpactFactor() {
  let newPG = blitzboard.tryPgParse(editor.getValue());
  let nodePropMap = {};
  newPG.nodes.forEach((n) => {
    nodePropMap[n.id] = Number(n.properties["初期確率"][0]);
  });
  console.log({nodePropMap});

  newPG.edges.forEach((e) => {
    let pi = nodePropMap[e.from];
    let pj = nodePropMap[e.to];
    let p = e.properties["確率"][0];
    let pp = (1 / (1 - pj)) * (Math.log(p / (1 - p)) - Math.log(pi / (1 - pi)));
    if (isFinite(pp)) {
      e.properties["クロスインパクト"] = [Math.round(pp * 100) / 100];
    } else {
      e.properties["クロスインパクト"] = ["inf"];
    }
  });

  byProgram = true;
  editor.setValue(json2pg.translate(JSON.stringify(newPG)));
  byProgram = false;
}