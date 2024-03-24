async function retrieveRelatedWords(query) {
  let result = await axios.post(`${vectorDBUrl}/related_words`, {
    article: query,
  });
  result = result.data;
  return result;
}

async function extractDisasterEvents(query, inProgressCallback, doneCallback) {
  let systemPrompt = `
# 命令: 
与えられる災害のニュース記事から、災害と、その原因、引き起こされた被害をひとつひとつ個別の事象としてなるべく多く抜き出し、事象の配列を作ってください。
ただし、各事象の文字数は１５文字以内になるようにしてください
また、各事象に対して、元のニュース記事のどのフレーズから抜き出したのかを明示してください。


# 出力フォーマット
・出力するフォーマットは以下のようなJSONです。
{
    "events": [
        {
            "event": "{{ 事象名 }}",
            "original_phrase": "{{ 元のニュース記事のフレーズ }}"
        },
        {
            "event": "{{ 事象名 }}",
            "original_phrase": "{{ 元のニュース記事のフレーズ }}"
        },
        ...
    ]
}

# 抽出する事象の例
`;

  const relatedWords = await retrieveRelatedWords(query);
  systemPrompt += relatedWords.map((w) => "* " + w.word).join("\n");

  return fetchCompletionInStream(
    systemPrompt,
    query,
    inProgressCallback,
    doneCallback
  );
}

async function fetchCompletionInStream(
  systemPrompt,
  query,
  inProgressCallback,
  doneCallback
) {
  const resp = await fetch(`${vectorDBUrl}/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt,
      query,
    }),
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
  const systemPrompt = `
  # 命令: 
  今から災害や被害の事象リストと、災害のニュース記事を与えます。
  ニュース記事の中に「{{原因事象}} -> {{結果事象}}」のような因果関係が含まれる場合は、その因果関係を抽出してください。
  また、抽出した因果関係に対して、元のニュース記事のどの部分から抜き出したのかを明示してください。

  # 出力フォーマット
    ・出力するフォーマットは以下のようなJSONです。
    {
        "relationships": [
            {
              "cause": "{{ 原因事象 }}",
              "result": "{{ 結果事象 }}",
              "original_phrase": "{{ 元のニュース記事の該当部分 }}"
            },
            {
              "cause": "{{ 原因事象 }}",
              "result": "{{ 結果事象 }}",
              "original_phrase": "{{ 元のニュース記事の該当部分 }}"
            },
            ...
        ]
    }

  # その他の制約条件: 
  ・与えられた事象リストに含まれていない事象は、出力に含めないようにしてください。
  ・「原因事象」の部分は、結果に対する直接の原因になるようにしてください。`;

  const query = `
  # 事象リスト
  ${events.join("\n")}
  # ニュース記事
  ${article}
  `;

  return fetchCompletionInStream(
    systemPrompt,
    query,
    inProgressCallback,
    doneCallback
  );
}
