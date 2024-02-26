async function retrieveRelatedWords(query) {
  let apiKey = document.querySelector("#options-api-key-input").value;
  let result = await axios.post(`${vectorDBUrl}/related_words`, {
    article: query,
    apiKey,
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
  doneCallback,
  model = "gpt-3.5-turbo-1106"
) {
  let apiKey = document.querySelector("#options-api-key-input").value;
  if (apiKey === "" || apiKey == undefined) {
    throw new Error("API Key is not set");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      stream: true,
    }),
  });
  const reader = response.body?.getReader();

  if (response.status !== 200 || !reader) {
    return {};
  } else {
    const decoder = new TextDecoder("utf-8");
    let json_snippet = "";
    try {
      const read = async () => {
        const { done, value } = await reader.read();
        if (done) return reader.releaseLock();

        const chunk = decoder.decode(value, { stream: true });

        const contents = chunk
          .split("data:")
          .map((data) => {
            const trimData = data.trim();
            if (["", "[DONE]"].includes(trimData)) return undefined;
            return JSON.parse(data.trim());
          })
          .filter((data) => data)
          .map((data) => {
            return data.choices[0].delta.content;
          });
        json_snippet += contents.join("");
        if (json_snippet !== "") {
          try {
            inProgressCallback(bestEffortJsonParser.parse(json_snippet));
          } catch (e) {
            console.error(e);
          }
        }
        return read();
      };
      await read();
    } catch (e) {
      console.error(e);
      throw e;
    }
    reader.releaseLock();
    doneCallback(JSON.parse(json_snippet));
  }
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
