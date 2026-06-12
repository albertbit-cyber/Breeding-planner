# E2E Reset Runner Script Report

Step: 222

## Added Scripts

Backend:

- `npm.cmd run e2e:reset`
- `npm.cmd run e2e:reset:local`

Lab:

- `npm.cmd run test:e2e:reset`

Breeder:

- `npm.cmd run test:e2e:reset`

## Behavior

The frontend reset scripts call the backend local reset and then run their Playwright suite.
