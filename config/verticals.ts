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
  {
    id: "chiropractor",
    name: "Chiropractor",
    searchTerms: ["chiropractor", "chiropractic clinic", "chiropractic care"],
    painPoints: [
      "New patients in pain are searching multiple clinics at once — the first to respond gets the booking",
      "Front desk is tied up with existing patients and misses new inquiry calls and form submissions",
      "After-hours form submissions sit until morning, by which point the patient has booked somewhere else",
    ],
    outcomeLanguage:
      "respond to every new patient inquiry in seconds and fill your schedule faster",
  },
  {
    id: "personal_trainer",
    name: "Personal Trainer",
    searchTerms: ["personal trainer", "personal training", "fitness coach"],
    painPoints: [
      "People inquiring about training are motivated in the moment — a slow reply kills that momentum",
      "Trial session requests go unanswered over the weekend and the prospect moves on by Monday",
      "Competing trainers who reply first consistently win the client regardless of price",
    ],
    outcomeLanguage:
      "reply to every trial session request instantly and convert more inquiries into paying clients",
  },
  {
    id: "landscaper",
    name: "Landscaper",
    searchTerms: ["landscaper", "landscaping company", "lawn care"],
    painPoints: [
      "Homeowners request quotes from three companies at once — whoever responds first usually gets the job",
      "Quote requests pile up during peak season when crews are out and no one is watching the inbox",
      "A delayed response on a spring or fall quote often means losing the job for the entire season",
    ],
    outcomeLanguage:
      "respond to every quote request the moment it comes in and win more jobs during peak season",
  },
];
