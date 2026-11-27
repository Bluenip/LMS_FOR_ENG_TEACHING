/**
 * Static periodic table (118 elements) for the offline exam tool drawer.
 * Standard atomic weights (IUPAC, rounded); mass number of the most stable isotope in brackets for
 * elements without a standard weight. `group` is null for lanthanides/actinides (f-block).
 */
export interface ElementInfo {
  number: number;
  symbol: string;
  nameEn: string;
  nameVi: string;
  mass: number;
  group: number | null;
  period: number;
}

// number|symbol|nameEn|nameVi|mass|group|period
const RAW = `1|H|Hydrogen|Hiđro|1.008|1|1
2|He|Helium|Heli|4.0026|18|1
3|Li|Lithium|Liti|6.94|1|2
4|Be|Beryllium|Beri|9.0122|2|2
5|B|Boron|Bo|10.81|13|2
6|C|Carbon|Cacbon|12.011|14|2
7|N|Nitrogen|Nitơ|14.007|15|2
8|O|Oxygen|Oxi|15.999|16|2
9|F|Fluorine|Flo|18.998|17|2
10|Ne|Neon|Neon|20.180|18|2
11|Na|Sodium|Natri|22.990|1|3
12|Mg|Magnesium|Magie|24.305|2|3
13|Al|Aluminium|Nhôm|26.982|13|3
14|Si|Silicon|Silic|28.085|14|3
15|P|Phosphorus|Photpho|30.974|15|3
16|S|Sulfur|Lưu huỳnh|32.06|16|3
17|Cl|Chlorine|Clo|35.45|17|3
18|Ar|Argon|Agon|39.948|18|3
19|K|Potassium|Kali|39.098|1|4
20|Ca|Calcium|Canxi|40.078|2|4
21|Sc|Scandium|Scanđi|44.956|3|4
22|Ti|Titanium|Titan|47.867|4|4
23|V|Vanadium|Vanađi|50.942|5|4
24|Cr|Chromium|Crom|51.996|6|4
25|Mn|Manganese|Mangan|54.938|7|4
26|Fe|Iron|Sắt|55.845|8|4
27|Co|Cobalt|Coban|58.933|9|4
28|Ni|Nickel|Niken|58.693|10|4
29|Cu|Copper|Đồng|63.546|11|4
30|Zn|Zinc|Kẽm|65.38|12|4
31|Ga|Gallium|Gali|69.723|13|4
32|Ge|Germanium|Gecmani|72.630|14|4
33|As|Arsenic|Asen|74.922|15|4
34|Se|Selenium|Selen|78.971|16|4
35|Br|Bromine|Brom|79.904|17|4
36|Kr|Krypton|Kripton|83.798|18|4
37|Rb|Rubidium|Rubiđi|85.468|1|5
38|Sr|Strontium|Stronti|87.62|2|5
39|Y|Yttrium|Ytri|88.906|3|5
40|Zr|Zirconium|Zirconi|91.224|4|5
41|Nb|Niobium|Niobi|92.906|5|5
42|Mo|Molybdenum|Molipđen|95.95|6|5
43|Tc|Technetium|Tecneti|98|7|5
44|Ru|Ruthenium|Rutheni|101.07|8|5
45|Rh|Rhodium|Rođi|102.91|9|5
46|Pd|Palladium|Palađi|106.42|10|5
47|Ag|Silver|Bạc|107.87|11|5
48|Cd|Cadmium|Cađimi|112.41|12|5
49|In|Indium|Inđi|114.82|13|5
50|Sn|Tin|Thiếc|118.71|14|5
51|Sb|Antimony|Antimon|121.76|15|5
52|Te|Tellurium|Telu|127.60|16|5
53|I|Iodine|Iot|126.90|17|5
54|Xe|Xenon|Xenon|131.29|18|5
55|Cs|Caesium|Xesi|132.91|1|6
56|Ba|Barium|Bari|137.33|2|6
57|La|Lanthanum|Lantan|138.91||6
58|Ce|Cerium|Xeri|140.12||6
59|Pr|Praseodymium|Praseođim|140.91||6
60|Nd|Neodymium|Neođim|144.24||6
61|Pm|Promethium|Prometi|145||6
62|Sm|Samarium|Samari|150.36||6
63|Eu|Europium|Europi|151.96||6
64|Gd|Gadolinium|Gađolini|157.25||6
65|Tb|Terbium|Tebi|158.93||6
66|Dy|Dysprosium|Đysprosi|162.50||6
67|Ho|Holmium|Honmi|164.93||6
68|Er|Erbium|Eribi|167.26||6
69|Tm|Thulium|Tuli|168.93||6
70|Yb|Ytterbium|Ytecbi|173.05||6
71|Lu|Lutetium|Lutexi|174.97||6
72|Hf|Hafnium|Hafini|178.49|4|6
73|Ta|Tantalum|Tantan|180.95|5|6
74|W|Tungsten|Vonfram|183.84|6|6
75|Re|Rhenium|Reni|186.21|7|6
76|Os|Osmium|Osimi|190.23|8|6
77|Ir|Iridium|Iriđi|192.22|9|6
78|Pt|Platinum|Platin|195.08|10|6
79|Au|Gold|Vàng|196.97|11|6
80|Hg|Mercury|Thủy ngân|200.59|12|6
81|Tl|Thallium|Tali|204.38|13|6
82|Pb|Lead|Chì|207.2|14|6
83|Bi|Bismuth|Bitmut|208.98|15|6
84|Po|Polonium|Poloni|209|16|6
85|At|Astatine|Atatin|210|17|6
86|Rn|Radon|Rađon|222|18|6
87|Fr|Francium|Franxi|223|1|7
88|Ra|Radium|Rađi|226|2|7
89|Ac|Actinium|Actini|227||7
90|Th|Thorium|Thori|232.04||7
91|Pa|Protactinium|Protactini|231.04||7
92|U|Uranium|Urani|238.03||7
93|Np|Neptunium|Neptuni|237||7
94|Pu|Plutonium|Plutoni|244||7
95|Am|Americium|Amerixi|243||7
96|Cm|Curium|Curi|247||7
97|Bk|Berkelium|Beckeli|247||7
98|Cf|Californium|Californi|251||7
99|Es|Einsteinium|Ensteni|252||7
100|Fm|Fermium|Fecmi|257||7
101|Md|Mendelevium|Menđelevi|258||7
102|No|Nobelium|Nobeli|259||7
103|Lr|Lawrencium|Lorenxi|266||7
104|Rf|Rutherfordium|Rutherfordi|267|4|7
105|Db|Dubnium|Đubni|268|5|7
106|Sg|Seaborgium|Seaborgi|269|6|7
107|Bh|Bohrium|Bohri|270|7|7
108|Hs|Hassium|Hassi|269|8|7
109|Mt|Meitnerium|Meitneri|278|9|7
110|Ds|Darmstadtium|Darmstađti|281|10|7
111|Rg|Roentgenium|Roentgeni|282|11|7
112|Cn|Copernicium|Copernixi|285|12|7
113|Nh|Nihonium|Nihoni|286|13|7
114|Fl|Flerovium|Flerovi|289|14|7
115|Mc|Moscovium|Moscovi|290|15|7
116|Lv|Livermorium|Livermori|293|16|7
117|Ts|Tennessine|Tennessine|294|17|7
118|Og|Oganesson|Oganesson|294|18|7`;

export const PERIODIC_TABLE: ElementInfo[] = RAW.split("\n").map((line) => {
  const [num, symbol, nameEn, nameVi, mass, group, period] = line.split("|");
  return {
    number: Number(num),
    symbol: symbol!,
    nameEn: nameEn!,
    nameVi: nameVi!,
    mass: Number(mass),
    group: group ? Number(group) : null,
    period: Number(period),
  };
});

export function findElement(query: string): ElementInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return PERIODIC_TABLE;
  const n = Number(q);
  const exact = (e: ElementInfo) => (Number.isInteger(n) && e.number === n) || e.symbol.toLowerCase() === q;
  const matches = PERIODIC_TABLE.filter(
    (e) => exact(e) || e.nameEn.toLowerCase().includes(q) || e.nameVi.toLowerCase().includes(q)
  );
  // exact symbol / atomic number first, then name matches
  return [...matches.filter(exact), ...matches.filter((e) => !exact(e))];
}
