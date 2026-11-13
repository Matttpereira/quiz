// Extrai os 23 personagens do Boneco.dc.html do design para public/boneco-data.js
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const re = /<sc-if value="\{\{h(\d+)\}\}"[^>]*>([\s\S]*?)<\/sc-if>/g;
const out = [];
let m;
while ((m = re.exec(src))) out[+m[1]] = m[2].trim().replace(/\{\{cor\}\}/g, '__COR__').replace(/\s*\n\s*/g, '');
if (out.length !== 23 || out.some((x) => !x)) throw new Error('esperava 23 personagens, achei ' + out.length);
fs.writeFileSync(process.argv[3], '// Gerado a partir de Boneco.dc.html (design "Quiz ao Vivo"). Não editar à mão.\nexport const BONECOS = ' + JSON.stringify(out) + ';\n');
console.log('ok', out.length, out.map((s) => s.length).join(','));
