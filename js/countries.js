/**
 * Complete list of countries (193 UN members + 2 observers + Taiwan + Kosovo).
 * Each entry: [ISO 3166-1 alpha-2 code, name, continent]
 */
const DATA = [
  // Africa (54)
  ["DZ","Algeria","Africa"],["AO","Angola","Africa"],["BJ","Benin","Africa"],
  ["BW","Botswana","Africa"],["BF","Burkina Faso","Africa"],["BI","Burundi","Africa"],
  ["CV","Cabo Verde","Africa"],["CM","Cameroon","Africa"],["CF","Central African Republic","Africa"],
  ["TD","Chad","Africa"],["KM","Comoros","Africa"],["CG","Congo","Africa"],
  ["CD","DR Congo","Africa"],["CI","Cote d'Ivoire","Africa"],["DJ","Djibouti","Africa"],
  ["EG","Egypt","Africa"],["GQ","Equatorial Guinea","Africa"],["ER","Eritrea","Africa"],
  ["SZ","Eswatini","Africa"],["ET","Ethiopia","Africa"],["GA","Gabon","Africa"],
  ["GM","Gambia","Africa"],["GH","Ghana","Africa"],["GN","Guinea","Africa"],
  ["GW","Guinea-Bissau","Africa"],["KE","Kenya","Africa"],["LS","Lesotho","Africa"],
  ["LR","Liberia","Africa"],["LY","Libya","Africa"],["MG","Madagascar","Africa"],
  ["MW","Malawi","Africa"],["ML","Mali","Africa"],["MR","Mauritania","Africa"],
  ["MU","Mauritius","Africa"],["MA","Morocco","Africa"],["MZ","Mozambique","Africa"],
  ["NA","Namibia","Africa"],["NE","Niger","Africa"],["NG","Nigeria","Africa"],
  ["RW","Rwanda","Africa"],["ST","Sao Tome and Principe","Africa"],["SN","Senegal","Africa"],
  ["SC","Seychelles","Africa"],["SL","Sierra Leone","Africa"],["SO","Somalia","Africa"],
  ["ZA","South Africa","Africa"],["SS","South Sudan","Africa"],["SD","Sudan","Africa"],
  ["TZ","Tanzania","Africa"],["TG","Togo","Africa"],["TN","Tunisia","Africa"],
  ["UG","Uganda","Africa"],["ZM","Zambia","Africa"],["ZW","Zimbabwe","Africa"],

  // Asia (49)
  ["AF","Afghanistan","Asia"],["AM","Armenia","Asia"],["AZ","Azerbaijan","Asia"],
  ["BH","Bahrain","Asia"],["BD","Bangladesh","Asia"],["BT","Bhutan","Asia"],
  ["BN","Brunei","Asia"],["KH","Cambodia","Asia"],["CN","China","Asia"],
  ["CY","Cyprus","Asia"],["GE","Georgia","Asia"],["IN","India","Asia"],
  ["ID","Indonesia","Asia"],["IR","Iran","Asia"],["IQ","Iraq","Asia"],
  ["IL","Israel","Asia"],["JP","Japan","Asia"],["JO","Jordan","Asia"],
  ["KZ","Kazakhstan","Asia"],["KW","Kuwait","Asia"],["KG","Kyrgyzstan","Asia"],
  ["LA","Laos","Asia"],["LB","Lebanon","Asia"],["MY","Malaysia","Asia"],
  ["MV","Maldives","Asia"],["MN","Mongolia","Asia"],["MM","Myanmar","Asia"],
  ["NP","Nepal","Asia"],["KP","North Korea","Asia"],["OM","Oman","Asia"],
  ["PK","Pakistan","Asia"],["PS","Palestine","Asia"],["PH","Philippines","Asia"],
  ["QA","Qatar","Asia"],["SA","Saudi Arabia","Asia"],["SG","Singapore","Asia"],
  ["KR","South Korea","Asia"],["LK","Sri Lanka","Asia"],["SY","Syria","Asia"],
  ["TW","Taiwan","Asia"],["TJ","Tajikistan","Asia"],["TH","Thailand","Asia"],
  ["TL","Timor-Leste","Asia"],["TM","Turkmenistan","Asia"],["AE","United Arab Emirates","Asia"],
  ["TR","Turkey","Asia"],["UZ","Uzbekistan","Asia"],["VN","Vietnam","Asia"],
  ["YE","Yemen","Asia"],

  // Europe (45)
  ["AL","Albania","Europe"],["AD","Andorra","Europe"],["AT","Austria","Europe"],
  ["BY","Belarus","Europe"],["BE","Belgium","Europe"],["BA","Bosnia and Herzegovina","Europe"],
  ["BG","Bulgaria","Europe"],["HR","Croatia","Europe"],["CZ","Czechia","Europe"],
  ["DK","Denmark","Europe"],["EE","Estonia","Europe"],["FI","Finland","Europe"],
  ["FR","France","Europe"],["DE","Germany","Europe"],["GR","Greece","Europe"],
  ["HU","Hungary","Europe"],["IS","Iceland","Europe"],["IE","Ireland","Europe"],
  ["IT","Italy","Europe"],["XK","Kosovo","Europe"],["LV","Latvia","Europe"],
  ["LI","Liechtenstein","Europe"],["LT","Lithuania","Europe"],["LU","Luxembourg","Europe"],
  ["MT","Malta","Europe"],["MD","Moldova","Europe"],["MC","Monaco","Europe"],
  ["ME","Montenegro","Europe"],["NL","Netherlands","Europe"],["MK","North Macedonia","Europe"],
  ["NO","Norway","Europe"],["PL","Poland","Europe"],["PT","Portugal","Europe"],
  ["RO","Romania","Europe"],["RU","Russia","Europe"],["SM","San Marino","Europe"],
  ["RS","Serbia","Europe"],["SK","Slovakia","Europe"],["SI","Slovenia","Europe"],
  ["ES","Spain","Europe"],["SE","Sweden","Europe"],["CH","Switzerland","Europe"],
  ["UA","Ukraine","Europe"],["GB","United Kingdom","Europe"],["VA","Vatican City","Europe"],

  // North America (23)
  ["AG","Antigua and Barbuda","North America"],["BS","Bahamas","North America"],
  ["BB","Barbados","North America"],["BZ","Belize","North America"],
  ["CA","Canada","North America"],["CR","Costa Rica","North America"],
  ["CU","Cuba","North America"],["DM","Dominica","North America"],
  ["DO","Dominican Republic","North America"],["SV","El Salvador","North America"],
  ["GD","Grenada","North America"],["GT","Guatemala","North America"],
  ["HT","Haiti","North America"],["HN","Honduras","North America"],
  ["JM","Jamaica","North America"],["MX","Mexico","North America"],
  ["NI","Nicaragua","North America"],["PA","Panama","North America"],
  ["KN","Saint Kitts and Nevis","North America"],["LC","Saint Lucia","North America"],
  ["VC","Saint Vincent and the Grenadines","North America"],
  ["TT","Trinidad and Tobago","North America"],["US","United States","North America"],

  // South America (12)
  ["AR","Argentina","South America"],["BO","Bolivia","South America"],
  ["BR","Brazil","South America"],["CL","Chile","South America"],
  ["CO","Colombia","South America"],["EC","Ecuador","South America"],
  ["GY","Guyana","South America"],["PY","Paraguay","South America"],
  ["PE","Peru","South America"],["SR","Suriname","South America"],
  ["UY","Uruguay","South America"],["VE","Venezuela","South America"],

  // Oceania (14)
  ["AU","Australia","Oceania"],["FJ","Fiji","Oceania"],
  ["KI","Kiribati","Oceania"],["MH","Marshall Islands","Oceania"],
  ["FM","Micronesia","Oceania"],["NR","Nauru","Oceania"],
  ["NZ","New Zealand","Oceania"],["PW","Palau","Oceania"],
  ["PG","Papua New Guinea","Oceania"],["WS","Samoa","Oceania"],
  ["SB","Solomon Islands","Oceania"],["TO","Tonga","Oceania"],
  ["TV","Tuvalu","Oceania"],["VU","Vanuatu","Oceania"],
];

/** Continent hue ranges for ball coloring */
const CONTINENT_HUE = {
  "Africa":        { h: 20,  s: 78, lMin: 40, lMax: 65 },
  "Asia":          { h: 45,  s: 82, lMin: 42, lMax: 68 },
  "Europe":        { h: 215, s: 68, lMin: 40, lMax: 65 },
  "North America": { h: 145, s: 62, lMin: 35, lMax: 60 },
  "South America": { h: 170, s: 72, lMin: 38, lMax: 62 },
  "Oceania":       { h: 280, s: 60, lMin: 40, lMax: 65 },
};

/** Simple hash for deterministic per-country variation */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getAllCountries() {
  return DATA.map(([code, name, continent]) => ({ code, name, continent }));
}

/** Get a deterministic HSL color for a country */
export function countryColor(code, continent) {
  const c = CONTINENT_HUE[continent] || CONTINENT_HUE["Europe"];
  const t = (hash(code) % 1000) / 1000;
  const hue = c.h + (t - 0.5) * 18;
  const lightness = c.lMin + t * (c.lMax - c.lMin);
  return { h: hue, s: c.s, l: lightness };
}

/** Return CSS hsl string */
export function countryColorCSS(code, continent) {
  const { h, s, l } = countryColor(code, continent);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
