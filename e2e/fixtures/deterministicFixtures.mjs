export const E2E_USERS = {
  admin: {
    email: "admin@breedingplanner.dev",
    fullName: "BreedingPlanner Admin",
    password: "admin1234",
  },
  breeder: {
    email: "breeder@proherper.dev",
    fullName: "Seed Breeder",
    password: "breeder1234",
  },
  lab: {
    email: "lab@proherper.dev",
    fullName: "Seed Lab User",
    password: "demo1234",
  },
};

export const E2E_ANIMALS = {
  primarySnake: {
    id: "25Ath-1",
    name: "Athena - DEMO",
    species: "Ball python",
    sex: "female",
    morph: "Clown",
  },
};

export const E2E_LAB_ORDERS = {
  baseline: {
    id: "e2e-lab-order-baseline",
    orderNumber: "05AA00001",
    status: "submitted",
    paymentStatus: "pending",
    animalId: E2E_ANIMALS.primarySnake.id,
    animalName: E2E_ANIMALS.primarySnake.name,
    testId: "clown",
    testName: "Clown",
  },
};

export const E2E_RESET_CONFIRM_VALUE = "local";
