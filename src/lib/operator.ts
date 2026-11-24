import "server-only";

/**
 * Betreiberdaten für Impressum und Datenschutz.
 * Bewusst als Konfiguration statt im Code, damit der Wechsel zur UG
 * nur eine Änderung der Umgebungsvariablen ist.
 */
export type OperatorInfo = {
  name: string | null;
  legalForm: string | null;
  street: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  register: string | null;
  vatId: string | null;
};

const clean = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export function getOperator(): OperatorInfo {
  return {
    name: clean(process.env.OPERATOR_NAME),
    legalForm: clean(process.env.OPERATOR_LEGAL_FORM),
    street: clean(process.env.OPERATOR_STREET),
    city: clean(process.env.OPERATOR_CITY),
    email: clean(process.env.OPERATOR_EMAIL),
    phone: clean(process.env.OPERATOR_PHONE),
    representative: clean(process.env.OPERATOR_REPRESENTATIVE),
    register: clean(process.env.OPERATOR_REGISTER),
    vatId: clean(process.env.OPERATOR_VAT_ID),
  };
}

export function isOperatorComplete(o: OperatorInfo) {
  return Boolean(o.name && o.street && o.city && o.email);
}
