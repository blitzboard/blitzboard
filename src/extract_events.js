async function retrieveRelatedWords(query) {
  let result = await axios.post(`${vectorDBUrl}/related_words`, {
    article: query,
  });
  result = result.data;
  return result;
}

async function extractEvents(query, inProgressCallback, doneCallback) {
  const relatedWords = await retrieveRelatedWords(query);
  return fetchInStream(
    "/extract_events",
    {
      query,
      sampleEvents: relatedWords.map((w) => "* " + w.word).join("\n"),
    },
    inProgressCallback,
    doneCallback
  );
}

async function fetchInStream(path, params, inProgressCallback, doneCallback) {
  const resp = await fetch(`${vectorDBUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const reader = resp.body.getReader();
  let jsonSnippet = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = new TextDecoder("utf-8").decode(value);
    jsonSnippet += text;
    try {
      inProgressCallback(bestEffortJsonParser.parse(jsonSnippet));
    } catch (e) {
      // do nothing
    }
  }
  doneCallback(bestEffortJsonParser.parse(jsonSnippet));
}

async function extractRelationships(
  events,
  article,
  inProgressCallback,
  doneCallback
) {
  const query = `
  # 事象リスト
  ${JSON.stringify(events)}
  # ニュース記事
  ${article}
  `;

  return fetchInStream(
    "/extract_relations",
    {
      query,
    },
    inProgressCallback,
    doneCallback
  );
}

async function extractProps(
  nodeName,
  article,
  props,
  inProgressCallback,
  doneCallback
) {
  return fetchInStream(
    "/extract_missing_props",
    {
      node: nodeName,
      props,
      article,
    },
    inProgressCallback,
    doneCallback
  );
}
