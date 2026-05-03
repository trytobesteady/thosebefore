let _data = null;
let _promise = null;

function parseCSVLine(line) {
  const result = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let val = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      result.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}

export async function loadPantheon() {
  if (_data) return _data;
  if (_promise) return _promise;
  _promise = fetch('/thosebefore/pantheon.csv')
    .then(r => r.text())
    .then(text => {
      const lines = text.trim().split('\n');
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i].trim());
        const birthyear = parseInt(cols[3], 10);
        const hpi = parseFloat(cols[16]);
        if (isNaN(birthyear) || isNaN(hpi)) continue;
        data.push({
          pageId: cols[0],
          name: cols[1],
          nameDe: cols[18] || '',
          wikidataId: cols[17] || '',
          descriptionEn: cols[19] || '',
          descriptionDe: cols[20] || '',
          birthyear,
          hpi,
        });
      }
      _data = data;
      _promise = null;
      return _data;
    })
    .catch(e => { _promise = null; throw e; });
  return _promise;
}

export async function getPantheonContemporaries(birthYear, range, excludeName, lang = 'en') {
  const data = await loadPantheon();
  const from = birthYear - range;
  const to = birthYear + range;
  return data
    .filter(p => p.birthyear >= from && p.birthyear <= to && p.name !== excludeName)
    .sort((a, b) => b.hpi - a.hpi)
    .map(p => ({
      id: `pantheon:${p.pageId}`,
      name: (lang === 'de' && p.nameDe) ? p.nameDe : p.name,
      description: (lang === 'de' && p.descriptionDe) ? p.descriptionDe : p.descriptionEn,
      pageId: p.pageId,
      wikidataId: p.wikidataId,
    }));
}
