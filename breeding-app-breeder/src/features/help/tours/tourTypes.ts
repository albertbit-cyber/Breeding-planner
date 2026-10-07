// Guided tours: an ordered list of steps that point at real controls. An info step is
// read and passed with Next; a do step waits until the app's own state shows the keeper
// did the thing. Tours hold i18n keys, never text (English in locales/en/help.json under
// tour.<tourId>).

// What a done() predicate can see. Read from the app's state, never from the DOM event
// that caused it.
export interface TourData {
  // Animals the keeper added (the built-in example collection does not count).
  realAnimals: number;
  // True while the built-in example collection is showing.
  demo: boolean;
  // Feed log entries across all animals.
  feeds: number;
  pairings: number;
  // The example animal the tour can offer exists.
  exampleAnimal: boolean;
  // Anything else an area tour needs, by name.
  [key: string]: number | boolean;
}

export interface TourContext {
  data: TourData;
  // [tab, sub-view?], e.g. ['animals'], ['pairings', 'incubator'], ['setup', 'appearance'].
  route: string[];
  // The data-dialog id of the open window, or null.
  modal: string | null;
  // Transient view flags worth checking (a species is open, a card is expanded, ...).
  view: Record<string, unknown>;
  // Counts captured when the step began, so what existed before does not count.
  base: Record<string, number>;
  // Is a control with this target on screen right now?
  has: (target: string) => boolean;
}

export interface TourOffer {
  // The only real action a tour may take, run only when the keeper presses it.
  id: 'add-example-animal';
  label: string;
  note: string;
}

export interface TourStep {
  id: string;
  kind: 'info' | 'do';
  // i18n keys
  part: string;
  title: string;
  text: string;
  missing?: string;
  // A data-tour id, a data-help id, or 'dialog'; omitted for a plain note.
  target?: string;
  // Required for do steps, forbidden for info steps. A throw counts as false.
  done?: (context: TourContext) => boolean;
  // Where the step lives, for "Take me there": [tab, sub-view?].
  route?: string[];
  offer?: TourOffer;
}

export interface Tour {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

// Builders that derive every key from the tour and step ids, so a tour file stays short.
export const keysFor = (tourId: string) => ({
  title: `help:tour.${tourId}.title`,
  description: `help:tour.${tourId}.description`,
  part: (n: number) => `help:tour.${tourId}.parts.${n}`,
  step: (stepId: string) => ({
    title: `help:tour.${tourId}.steps.${stepId}.title`,
    text: `help:tour.${tourId}.steps.${stepId}.text`,
    missing: `help:tour.${tourId}.steps.${stepId}.missing`,
  }),
});

type StepInput = Omit<TourStep, 'part' | 'title' | 'text' | 'missing'> & { part: number; missing?: boolean };

export const defineTour = (id: string, steps: StepInput[]): Tour => {
  const keys = keysFor(id);
  return {
    id,
    title: keys.title,
    description: keys.description,
    steps: steps.map(({ part, missing, ...rest }) => ({
      ...rest,
      part: keys.part(part),
      title: keys.step(rest.id).title,
      text: keys.step(rest.id).text,
      missing: missing ? keys.step(rest.id).missing : undefined,
    })),
  };
};
