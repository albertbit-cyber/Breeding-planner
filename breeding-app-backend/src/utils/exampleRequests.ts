/*
Example request: POST /api/lab/orders/calculate-price
{
  "animals": [
    {
      "animalId": "A001",
      "animalName": "Pastel Clown Female",
      "selectedTestIds": ["clown", "pied"]
    },
    {
      "animalId": "A002",
      "animalName": "Ultramel Male",
      "selectedTestIds": ["sex-determination"]
    }
  ]
}

Example request: POST /api/lab/orders
{
  "animals": [
    {
      "animalId": "A001",
      "animalName": "Pastel Clown Female",
      "selectedTestIds": ["clown", "pied"]
    },
    {
      "animalId": "A002",
      "animalName": "Ultramel Male",
      "selectedTestIds": ["sex-determination"]
    }
  ]
}
*/

export const EXAMPLE_REQUESTS = true;
