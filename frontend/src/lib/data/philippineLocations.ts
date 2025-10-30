// Philippine Regions and Cities
export const philippineLocations = {
  'NCR': [
    'Caloocan City',
    'Las Piñas City',
    'Makati City',
    'Malabon City',
    'Mandaluyong City',
    'Manila',
    'Marikina City',
    'Muntinlupa City',
    'Navotas City',
    'Parañaque City',
    'Pasay City',
    'Pasig City',
    'Quezon City',
    'San Juan City',
    'Taguig City',
    'Valenzuela City',
    'Pateros'
  ],
  'Region I - Ilocos Region': [
    'Alaminos City',
    'Batac City',
    'Candon City',
    'Dagupan City',
    'Laoag City',
    'San Carlos City',
    'San Fernando City',
    'Urdaneta City',
    'Vigan City'
  ],
  'Region II - Cagayan Valley': [
    'Cauayan City',
    'Ilagan City',
    'Santiago City',
    'Tuguegarao City'
  ],
  'Region III - Central Luzon': [
    'Angeles City',
    'Balanga City',
    'Cabanatuan City',
    'Gapan City',
    'Mabalacat City',
    'Malolos City',
    'Meycauayan City',
    'Muñoz City',
    'Olongapo City',
    'Palayan City',
    'San Fernando City',
    'San Jose City',
    'San Jose del Monte City',
    'Tarlac City'
  ],
  'Region IV-A - CALABARZON': [
    'Antipolo City',
    'Bacoor City',
    'Batangas City',
    'Biñan City',
    'Cabuyao City',
    'Calamba City',
    'Cavite City',
    'Dasmariñas City',
    'General Trias City',
    'Imus City',
    'Lipa City',
    'Lucena City',
    'San Pablo City',
    'San Pedro City',
    'Santa Rosa City',
    'Tagaytay City',
    'Tanauan City',
    'Trece Martires City'
  ],
  'Region IV-B - MIMAROPA': [
    'Calapan City',
    'Puerto Princesa City'
  ],
  'Region V - Bicol Region': [
    'Iriga City',
    'Legazpi City',
    'Ligao City',
    'Masbate City',
    'Naga City',
    'Sorsogon City',
    'Tabaco City'
  ],
  'Region VI - Western Visayas': [
    'Bacolod City',
    'Bago City',
    'Cadiz City',
    'Escalante City',
    'Himamaylan City',
    'Iloilo City',
    'Kabankalan City',
    'La Carlota City',
    'Passi City',
    'Roxas City',
    'Sagay City',
    'San Carlos City',
    'Silay City',
    'Sipalay City',
    'Talisay City',
    'Victorias City'
  ],
  'Region VII - Central Visayas': [
    'Bais City',
    'Bayawan City',
    'Bogo City',
    'Canlaon City',
    'Carcar City',
    'Cebu City',
    'Danao City',
    'Dumaguete City',
    'Guihulngan City',
    'Lapu-Lapu City',
    'Mandaue City',
    'Naga City',
    'Tagbilaran City',
    'Talisay City',
    'Toledo City'
  ],
  'Region VIII - Eastern Visayas': [
    'Baybay City',
    'Borongan City',
    'Calbayog City',
    'Catbalogan City',
    'Maasin City',
    'Ormoc City',
    'Tacloban City'
  ],
  'Region IX - Zamboanga Peninsula': [
    'Dapitan City',
    'Dipolog City',
    'Isabela City',
    'Pagadian City',
    'Zamboanga City'
  ],
  'Region X - Northern Mindanao': [
    'Cagayan de Oro City',
    'El Salvador City',
    'Gingoog City',
    'Iligan City',
    'Malaybalay City',
    'Oroquieta City',
    'Ozamiz City',
    'Tangub City',
    'Valencia City'
  ],
  'Region XI - Davao Region': [
    'Davao City',
    'Digos City',
    'Mati City',
    'Panabo City',
    'Samal City',
    'Tagum City'
  ],
  'Region XII - SOCCSKSARGEN': [
    'Cotabato City',
    'General Santos City',
    'Koronadal City',
    'Tacurong City'
  ],
  'Region XIII - Caraga': [
    'Bayugan City',
    'Bislig City',
    'Butuan City',
    'Cabadbaran City',
    'Surigao City',
    'Tandag City'
  ],
  'CAR - Cordillera Administrative Region': [
    'Baguio City',
    'Tabuk City'
  ],
  'BARMM - Bangsamoro Autonomous Region': [
    'Cotabato City',
    'Lamitan City',
    'Marawi City'
  ]
} as const;

export type Region = keyof typeof philippineLocations;
export type City = typeof philippineLocations[Region][number];

export const regions = Object.keys(philippineLocations) as Region[];

export function getCitiesByRegion(region: Region | string): string[] {
  if (region in philippineLocations) {
    return philippineLocations[region as Region] as unknown as string[];
  }
  return [];
}
