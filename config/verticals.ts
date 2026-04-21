// Target verticals for prospecting and outreach.
// searchTerms: what we type into Google Maps to find these businesses.
// painPoints: used by Outreach Agent to write personalized cold emails.
// Never mention AI or automation in prospect-facing content.

export interface Vertical {
  id: string;
  name: string;
  searchTerms: string[];
  painPoints: string[];
  outcomeLanguage: string; // The ROI framing we use in outreach for this vertical
}

export const VERTICALS: Vertical[] = [
  {
    id: "gym",
    name: "Gym",
    searchTerms: ["gym", "fitness centre", "personal training studio"],
    painPoints: [
      "New members fill out a trial request and never hear back fast enough",
      "Front desk is too busy to respond to every inquiry immediately",
      "Leads go cold over the weekend when no one is monitoring the inbox",
    ],
    outcomeLanguage:
      "stop losing trial sign-ups to slow response time and book more members",
  },
  {
    id: "photographer",
    name: "Photographer",
    searchTerms: ["photographer", "photography studio", "wedding photographer"],
    painPoints: [
      "Couples contact multiple photographers at once — the first to reply wins the booking",
      "Inquiry forms pile up during busy season and take days to respond to",
      "Generic auto-replies feel impersonal and drive prospects to competitors",
    ],
    outcomeLanguage:
      "be the first to reply to every inquiry and book more sessions",
  },
  {
    id: "massage_therapist",
    name: "Massage Therapist",
    searchTerms: [
      "massage therapist",
      "registered massage therapy",
      "RMT clinic",
    ],
    painPoints: [
      "Patients contact multiple clinics — whoever replies first gets the appointment",
      "New patient inquiries come in after hours when the clinic is closed",
      "Slow response means patients book elsewhere and never come back",
    ],
    outcomeLanguage:
      "fill your appointment book faster by responding to every new patient inquiry in seconds",
  },
];
