import { z } from 'zod';

// List of all 52 Spanish provinces mapped to their 2-digit postal code prefixes
export const PROVINCE_MAP: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
  '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
  '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
  '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
  '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
  '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza',
  '51': 'Ceuta', '52': 'Melilla'
};

/**
 * Validates Spanish DNI format (8 digits + 1 letter)
 * Calculates the expected letter to verify authenticity.
 */
export const isValidDni = (dni: string): boolean => {
  const dniRegex = /^[0-9]{8}[A-Z]$/i;
  if (!dniRegex.test(dni)) return false;

  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const number = parseInt(dni.slice(0, 8), 10);
  const letter = dni.slice(8).toUpperCase();
  
  if (number === 0 && letter === 'A') return false; // Reject 00000000A placeholder

  const expectedLetter = letters[number % 23];
  return letter === expectedLetter;
};

/**
 * Validates Spanish NIE format (X, Y, Z + 7 digits + 1 letter)
 */
export const isValidNie = (nie: string): boolean => {
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/i;
  if (!nieRegex.test(nie)) return false;

  let prefix = nie.charAt(0).toUpperCase();
  let prefixNum = prefix === 'X' ? 0 : prefix === 'Y' ? 1 : 2;
  
  const parsedDni = `${prefixNum}${nie.slice(1)}`;
  return isValidDni(parsedDni);
};

export const spanishDocumentSchema = z.string().refine((val) => {
  return isValidDni(val) || isValidNie(val);
}, { message: "Invalid DNI or NIE format" });

/**
 * Complete Spanish Address Schema conforming to AEPD and Correos standards.
 */
export const spanishAddressSchema = z.object({
  streetType: z.string().optional(), // Calle, Avenida, Paseo, Plaza
  streetName: z.string().min(2, "Street name is required"),
  streetNumber: z.string().min(1, "Number is required"),
  escalera: z.string().optional(), // Stairwell
  piso: z.string().optional(),     // Floor
  puerta: z.string().optional(),   // Door/Apartment number
  codigoPostal: z.string().regex(/^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/, "Invalid Spanish postal code"),
  ciudad: z.string().min(2, "City is required"),
  provincia: z.string().optional() // Can be derived from postal code, but often explicitly requested
}).transform((data) => {
  // Automatically derive province if not provided
  if (!data.provincia && data.codigoPostal) {
    const prefix = data.codigoPostal.substring(0, 2);
    data.provincia = PROVINCE_MAP[prefix] || undefined;
  }
  return data;
});

export type SpanishAddressInput = z.input<typeof spanishAddressSchema>;
export type SpanishAddressOutput = z.output<typeof spanishAddressSchema>;
