import type { CapitalTemplateId } from "@/frontend/lib/types";

export type CapitalTemplate = {
  id: Exclude<CapitalTemplateId, "custom">;
  name: string;
  glyph: string;
  items: string[];
};

export const CAPITAL_TEMPLATES: CapitalTemplate[] = [
  {
    id: "marriage",
    name: "Marriage",
    glyph: "💍",
    items: ["Venue", "Catering", "Attire", "Photography", "Rings", "Honeymoon"],
  },
  {
    id: "trip",
    name: "Trip",
    glyph: "✈️",
    items: ["Flights", "Accommodation", "Activities", "Travel Insurance", "Visa"],
  },
  {
    id: "car-loan",
    name: "Car Loan",
    glyph: "🚗",
    items: ["Downpayment", "Road Tax", "Registration", "Insurance", "Loan Processing Fee"],
  },
  {
    id: "house-loan",
    name: "House Loan",
    glyph: "🏠",
    items: ["Downpayment", "Stamp Duty", "Legal Fees", "Loan Processing Fee", "Renovation"],
  },
];
