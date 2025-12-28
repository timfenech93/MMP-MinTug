/* TugCalc PWA
 * - Reads tug_requirements.csv from / (same folder)
 * - Dropdown selection (no typing)
 * - LOA band match inclusive
 * - Berthing vs Unberthing
 * - Rounds UP to whole tugs (Math.ceil)
 */

let bands = [];
let locations = [];
let isBerthing = true;

const els = {
  btnBerth: document.getElementById('btnBerth'),
  btnUnberth: document.getElementById('btnUnberth'),
  locationSelect: document.getElementById('locationSelect'),
  loaInput: document.getElementById('loaInput'),
  calcBtn: document.getElementById('calcBtn'),
  error: document.getElementById('error'),
  emptyState: document.getElementById('emptyState'),
  resultCard: document.getElementById('resultCard'),
  tugsOut: document.getElementById('tugsOut'),
  bandOut: document.getElementById('bandOut'),
  ruleOut: document.getElementById('ruleOut'),
  notesOut: document.getElementById('notesOut'),
};

function setMode(berth) {
  isBerthing = berth;
  els.btnBerth.classList.toggle('chip-selected', berth);
  els.btnUnberth.classList.toggle('chip-selected', !berth);
}

els.btnBerth.addEventListener('click', () => setMode(true));
els.btnUnberth.addEventListener('click', () => setMode(false));

function normalizeHeader(s){
  return String(s || '').trim().toLowerCase().replace(/\s+/g,'_').replace(/-/g,'_');
}

// Minimal CSV parser with quotes support
function parseCsv(text){
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i=0;i<text.length;i++){
    const c = text[i];

    if (c === '"'){
      if (inQuotes && text[i+1] === '"'){ field += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }

    if (c === ',' && !inQuotes){
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((c === '\n' || c === '\r') && !inQuotes){
      // handle CRLF
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field.trim());
      field = '';
      const trimmed = row.join('').trim();
      if (row.length > 1 && trimmed !== '' && trimmed !== '...') rows.push(row);
      row = [];
      continue;
    }

    field += c;
  }

  // last row
  if (field.length || row.length){
    row.push(field.trim());
    const trimmed = row.join('').trim();
    if (row.length > 1 && trimmed !== '' && trimmed !== '...') rows.push(row);
  }
  return rows;
}

function toNumber(x){
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : null;
}

function populateLocations(){
  els.locationSelect.innerHTML = '';
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    els.locationSelect.appendChild(opt);
  });
}

function showError(msg){
  els.error.textContent = msg || '';
}

function showResult({tugsRounded, bandLabel, ruleText, notesText}){
  els.emptyState.classList.add('hidden');
  els.resultCard.classList.remove('hidden');
  els.tugsOut.textContent = String(tugsRounded);
  els.bandOut.textContent = bandLabel || '—';
  els.ruleOut.textContent = ruleText && ruleText.trim() ? ruleText : '—';
  els.notesOut.textContent = notesText && notesText.trim() ? notesText : '—';
}

function hideResult(){
  els.resultCard.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
}

function calculate(){
  showError('');
  const loc = els.locationSelect.value;
  const loa = toNumber(els.loaInput.value);
  if (loa === null) {
    showError('Enter a valid LOA (m).');
    return;
  }
  if (!loc) {
    showError('Select a jetty/location.');
    return;
  }

  const match = bands.find(b =>
    b.location.toLowerCase() === loc.toLowerCase() &&
    loa >= b.minLengthM && loa <= b.maxLengthM
  );

  if (!match){
    showError('No matching LOA band found for this location.');
    showResult({tugsRounded:'—', bandLabel:'—', ruleText:'—', notesText:'—'});
    return;
  }

  const raw = isBerthing ? match.berthingTugs : match.unberthingTugs;
  const tugsRounded = Math.ceil(raw);

  const ruleText = isBerthing ? match.berthingRule : match.unberthingRule;
  const notesText = match.additionalNotes;

  showResult({
    tugsRounded,
    bandLabel: `${match.minLengthM}–${match.maxLengthM} m`,
    ruleText,
    notesText
  });
}

els.calcBtn.addEventListener('click', calculate);

async function init(){
  try{
    const res = await fetch('./tug_requirements.csv', {cache:'no-cache'});
    if (!res.ok) throw new Error(`Failed to load CSV (HTTP ${res.status})`);
    const csvText = await res.text();
    const rows = parseCsv(csvText);
    if (rows.length < 2) throw new Error('CSV is empty or unreadable.');

    const header = rows[0].map(normalizeHeader);

    function idx(...names){
      for (const n of names){
        const i = header.indexOf(normalizeHeader(n));
        if (i >= 0) return i;
      }
      return -1;
    }

    const iLocation   = idx('location','harbour','port','area');
    const iMin        = idx('min_length_m','min_length','loa_min','min_loa_m','min_loa');
    const iMax        = idx('max_length_m','max_length','loa_max','max_loa_m','max_loa');
    const iBerthTugs  = idx('berthing_tugs_no','berthing_tugs','berthing','tugs_berthing');
    const iBerthRule  = idx('berthing_rule','rule_berthing');
    const iUnbTugs    = idx('unberthing_tugs_no','unberthing_tugs','unberthing','tugs_unberthing');
    const iUnbRule    = idx('unberthing_rule','rule_unberthing');
    const iNotes      = idx('additional_notes','additionalnotes','notes','remarks','additional_note');

    if ([iLocation,iMin,iMax,iBerthTugs,iUnbTugs].some(i => i < 0)){
      throw new Error('CSV headers not recognised. Expected Location/Min/Max/Berthing/Unberthing columns.');
    }

    bands = rows.slice(1).map(cols => {
      const location = (cols[iLocation] || '').trim();
      const min = toNumber(cols[iMin]);
      const max = toNumber(cols[iMax]);
      const berthTugs = toNumber(cols[iBerthTugs]);
      const unbTugs = toNumber(cols[iUnbTugs]);
      const berthRule = iBerthRule >= 0 ? (cols[iBerthRule] || '').trim() : '';
      const unbRule = iUnbRule >= 0 ? (cols[iUnbRule] || '').trim() : '';
      const notes = iNotes >= 0 ? (cols[iNotes] || '').trim() : '';

      return {
        location,
        minLengthM: min ?? 0,
        maxLengthM: max ?? 0,
        berthingTugs: berthTugs ?? 0,
        berthingRule: berthRule,
        unberthingTugs: unbTugs ?? 0,
        unberthingRule: unbRule,
        additionalNotes: notes
      };
    }).filter(b => b.location && Number.isFinite(b.minLengthM) && Number.isFinite(b.maxLengthM));

    locations = Array.from(new Set(bands.map(b => b.location))).sort((a,b)=>a.localeCompare(b));
    populateLocations();
    setMode(true);
    hideResult();
  }catch(err){
    console.error(err);
    showError(err.message || String(err));
  }
}

init();
