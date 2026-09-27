#!/usr/bin/env node
import { main } from '../src/aunx.js';

main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  console.error(`aunx: ${error.message}`);
  process.exitCode = 2;
});
