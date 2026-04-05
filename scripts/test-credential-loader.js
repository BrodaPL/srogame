const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.resolve(__dirname, 'local-test-credentials.json');
const TEMPLATE_PATH = path.resolve(__dirname, 'local-test-credentials.example.json');

function loadCredentialSet() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      [
        `Missing local credential file: ${CREDENTIALS_PATH}`,
        `Create it from: ${TEMPLATE_PATH}`
      ].join('\n')
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to parse ${CREDENTIALS_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid credential file format in ${CREDENTIALS_PATH}. Expected a JSON object.`);
  }

  return parsed;
}

function loadTestCredential(entryKey) {
  const credentials = loadCredentialSet()[entryKey];
  if (!credentials || typeof credentials !== 'object') {
    throw new Error(`Credential entry "${entryKey}" is missing in ${CREDENTIALS_PATH}.`);
  }

  const playerName = typeof credentials.playerName === 'string' ? credentials.playerName.trim() : '';
  const password = typeof credentials.password === 'string' ? credentials.password : '';
  if (!playerName || !password) {
    throw new Error(
      `Credential entry "${entryKey}" in ${CREDENTIALS_PATH} must include non-empty "playerName" and "password".`
    );
  }

  return { playerName, password };
}

module.exports = {
  CREDENTIALS_PATH,
  TEMPLATE_PATH,
  loadTestCredential
};
