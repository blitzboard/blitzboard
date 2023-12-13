let apiKey = ""; // <your api key>;
async function extractDisasterEvents(query) {
  // const systemPrompt = `
  //   # 命令:
  //   与えられる災害のニュース記事から、災害と、引き起こされた被害をひとつひとつ個別の事象として抜き出し、イベントの配列を作ってください。
  //   また、各事象に対して、元のニュース記事のどのフレーズから抜き出したのかを明示してください。

  //   # 出力フォーマット
  //   ・出力するフォーマットは以下のようなJSONです。
  //   {
  //       "events": [
  //           {
  //               "event": "{{ 事象名 }}",
  //               "original_phrase": "{{ 元のニュース記事のフレーズ }}"
  //           },
  //           {
  //               "event": "{{ 事象名 }}",
  //               "original_phrase": "{{ 元のニュース記事のフレーズ }}"
  //           },
  //           ...
  //       ]
  //   }

  //   # その他の制約条件:
  //   ・出力するイベントの各要素は必ず１つの事象に対応するようにしてください。分解可能な事象はなるべく分解し、１つの項目の中に原因と結果の両方を含めないようにしてください
  //   ・災害に関係しないものはリストに含めないようにしてください。
  //   ・原因や結果の語彙はなるべく統一して、同じ事象に別の表現を使わないようにしてください。
  //   `;

  const systemPrompt = `
    # 命令: 
    与えられる災害のニュース記事から、災害と、引き起こされた被害をひとつひとつ個別の事象として抜き出し、イベントの配列を作ってください。
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

    # その他の制約条件: 
    ・出力するイベントの各要素は必ず１つの事象に対応するようにしてください。分解可能な事象はなるべく分解してください。
    ・１つの事象は、最大でも１０文字以内になるようにしてください。
    ・災害に関係しないものはリストに含めないようにしてください。
    ・原因や結果の語彙はなるべく統一して、同じ事象に別の表現を使わないようにしてください。
    `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo-1106",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  const json = await response.json();

  console.log(JSON.parse(json.choices[0].message.content));

  if (json.choices[0].message.content === null) {
    return {};
  } else {
    return JSON.parse(json.choices[0].message.content);
  }
}

async function extractRelationships(events, article) {
  const systemPrompt = `
  # 命令: 
  災害や被害の事象リストと、災害のニュース記事を与えるので、ニュース記事の中に「{{原因事象}} -> {{結果事象}}」のような因果関係が含まれる場合は、
  また、因果関係に対して、元のニュース記事のどのフレーズから抜き出したのかを明示してください。

  # 出力フォーマット
    ・出力するフォーマットは以下のようなJSONです。
    {
        "relationships": [
            {
              "cause": "{{ 原因事象 }}",
              "result": "{{ 結果事象 }}",
              "original_phrase": "{{ 元のニュース記事のフレーズ }}"
            },
            {
              "cause": "{{ 原因事象 }}",
              "result": "{{ 結果事象 }}",
              "original_phrase": "{{ 元のニュース記事のフレーズ }}"
            },
            ...
        ]
    }

  # その他の制約条件: 
  ・与えられた事象のリストに含まれていないものは、出力に含めないようにしてください。`;

  const query = `
  # 事象リスト
  ${events.join("\n")}
  # ニュース記事
  ${article}
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo-1106",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  const json = await response.json();

  console.log(JSON.parse(json.choices[0].message.content));

  if (json.choices[0].message.content === null) {
    return {};
  } else {
    return JSON.parse(json.choices[0].message.content);
  }
}
