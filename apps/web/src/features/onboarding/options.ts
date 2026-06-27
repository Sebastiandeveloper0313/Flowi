// Selectable option sets for the onboarding pill grids.

export const TEAM_SIZES = ["Just me", "2 - 5", "6 - 10", "11 - 20", "21 - 50", "50+"] as const;

export const REVENUES = [
  "Pre-revenue",
  "$1 - $1,000",
  "$1,000 - $10k",
  "$10k - $50k",
  "$50k - $500k",
  "$500k+",
] as const;

export const ROLES = [
  "Founder",
  "Social Media Manager",
  "Marketing Manager",
  "Agency Owner",
  "Freelancer",
  "Product Manager",
  "Content Creator",
  "Growth Manager",
  "Other",
] as const;

export const BUSINESS_MODELS = [
  { value: "b2b", label: "B2B" },
  { value: "b2c", label: "B2C" },
  { value: "both", label: "Both" },
] as const;

export const BUSINESS_CATEGORIES = [
  "E-commerce",
  "SaaS",
  "Agency",
  "Services",
  "Marketplace",
  "Media/Content",
  "Mobile app",
  "Other",
] as const;

export const TOTAL_STEPS = 5;
