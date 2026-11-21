const small = {zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19};
const tens = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90};
const words = [...Object.keys(small), ...Object.keys(tens), "hundred", "thousand"];
const expression = new RegExp(`\\b(?:${words.join("|")})(?:(?:[ -]+(?:and[ -]+)?)(?:${words.join("|")}))*\\b`, "gi");

export function normalizeSpokenNumbers(text) {
  return text.replace(expression, (phrase) => {
    const tokens = phrase.toLowerCase().split(/[ -]+/);
    if (tokens.length > 1 && tokens.every((word) => small[word] !== undefined && small[word] < 10)) {
      return tokens.map((word) => small[word]).join("");
    }
    let total = 0, group = 0;
    for (const word of tokens) {
      if (word === "hundred") group = (group || 1) * 100;
      else if (word === "thousand") { total += (group || 1) * 1000; group = 0; }
      else if (word !== "and") group += small[word] ?? tens[word] ?? 0;
    }
    return String(total + group);
  }).replace(/(\d+)\s+(?:point|dot)\s+(\d+)/gi, "$1.$2").replace(/(\d),(?=\d{3}\b)/g, "$1");
}
