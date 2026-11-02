const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
function removeQuotes(value) {
  return value.trim().replace(/^"(.*)"$/, '$1');
}

function parseBoolean(value) {
  const normalizedValue = removeQuotes(value).toLowerCase();

  if (normalizedValue !== 'true' && normalizedValue !== 'false') {
    throw new Error(`valor booleano inválido: "${value}"`);
  }

  return normalizedValue === 'true';
}

function parsePosition(line, lineNumber) {
  const columns = line.split(';').map(removeQuotes);

  if (columns.length !== 7) {
    throw new Error(
      `Linha ${lineNumber}: esperado 7 campos, mas foram encontrados ${columns.length}.`,
    );
  }

  const [
    monitoredId,
    faction,
    timestamp,
    latitude,
    longitude,
    protectiveMeasure,
    restrictionIds,
  ] = columns;

  if (!monitoredId) {
    throw new Error(`Linha - ${lineNumber}: idMonitorado nao informado`);
  }

  if (!/^\d+$/.test(monitoredId)) {
    throw new Error(`Linha - ${lineNumber}: idMonitorado deve ser um numero inteiro.`);
  }

  if (!timestamp) {
    throw new Error(`Linha - ${lineNumber}: timestamp e obrigatorio.`);
  }

  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)
  ) {
    throw new Error(
      `Linha - ${lineNumber}: timestamp fora do formato esperado`,
    );
  }

  if (!latitude || !longitude) {
    throw new Error(
      `Linha - ${lineNumber}: latitude e longitude sao obrigatorias.`,
    );
  }

  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);

  if (
    !Number.isFinite(latitudeNumber) ||
    latitudeNumber < -90 ||
    latitudeNumber > 90
  ) {
    throw new Error(`Linha - ${lineNumber}: latitude invalida.`);
  }

  if (
    !Number.isFinite(longitudeNumber) ||
    longitudeNumber < -180 ||
    longitudeNumber > 180
  ) {
    throw new Error(`Linha - ${lineNumber}: longitude invalida.`);
  }

  return {
    idMonitorado: Number(monitoredId),
    faccaoMonitorado: faction || null,
    timestamp,
    latitude: latitudeNumber,
    longitude: longitudeNumber,
    medidaProtetiva: parseBoolean(protectiveMeasure),
    idsRestricaoMedida: restrictionIds
      ? restrictionIds.split(',').map(Number)
      : [],
  };
}

function parseDataSet(data) {
  const lines = data
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const header = lines.shift().split(';');
  if (header.length !== 7) {
    throw new Error('Cabeçalho inválido: esperado 7 colunas.');
  }

  return lines.map((line, index) => parsePosition(line, index + 2));
}

async function readDataSet(fileName) {
  const filePath = path.join(__dirname, 'Datasets', fileName);
  const data = await fs.readFile(filePath, 'utf8');

  return parseDataSet(data);
}
const EARTH_RADIUS_IN_METERS = 6_371_000;
const MAX_ENCOUNTER_DISTANCE_IN_METERS = 20;
const DEGREES_TO_RADIANS = Math.PI / 180;

function preparePosition(position) {
  const latitudeRadians = position.latitude * DEGREES_TO_RADIANS;
  const longitudeRadians = position.longitude * DEGREES_TO_RADIANS;

  return {
    ...position,
    latitudeRadians,
    longitudeRadians,
    cosineLatitude: Math.cos(latitudeRadians),
  };
}

function canBeWithinEncounterDistance(firstPosition, secondPosition) {
  const deltaLatitude = Math.abs(
    firstPosition.latitudeRadians - secondPosition.latitudeRadians,
  );

  if (EARTH_RADIUS_IN_METERS * deltaLatitude >= MAX_ENCOUNTER_DISTANCE_IN_METERS) {
    return false;
  }

  const deltaLongitude = Math.abs(
    firstPosition.longitudeRadians - secondPosition.longitudeRadians,
  );
  const minimumLongitudeDistance =
    2 *
    EARTH_RADIUS_IN_METERS *
    Math.sqrt(
      firstPosition.cosineLatitude * secondPosition.cosineLatitude,
    ) *
    Math.sin(deltaLongitude / 2);

  return minimumLongitudeDistance < MAX_ENCOUNTER_DISTANCE_IN_METERS;
}

function calcDistance(firstPosition, secondPosition) {
  const deltaLatitude =
    secondPosition.latitudeRadians - firstPosition.latitudeRadians;
  const deltaLongitude =
    secondPosition.longitudeRadians - firstPosition.longitudeRadians;

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    firstPosition.cosineLatitude *
      secondPosition.cosineLatitude *
      Math.sin(deltaLongitude / 2) ** 2;

  const centralAngle = 2 * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(1 - haversine),
  );

  return EARTH_RADIUS_IN_METERS * centralAngle;
}
function searchPairInDataset(clusteredPositions) {
  const encounters = [];

  for (let firstIndex = 0; firstIndex < clusteredPositions.length; firstIndex++) {
    for ( let secondIndex = firstIndex + 1; secondIndex < clusteredPositions.length; secondIndex++) {
      const firstPosition = clusteredPositions[firstIndex];
      const secondPosition = clusteredPositions[secondIndex];

      if (!canBeWithinEncounterDistance(firstPosition, secondPosition)) {
        continue;
      }

      const distance = calcDistance(firstPosition, secondPosition);

      if (distance >= MAX_ENCOUNTER_DISTANCE_IN_METERS) {
        continue;
      }

      let type;

      if ( firstPosition.faccaoMonitorado !== null && firstPosition.faccaoMonitorado === secondPosition.faccaoMonitorado) 
        {
        type = 'faccao';
      }else if ( firstPosition.medidaProtetiva !== secondPosition.medidaProtetiva && (firstPosition.idsRestricaoMedida.includes(secondPosition.idMonitorado) ||secondPosition.idsRestricaoMedida.includes(firstPosition.idMonitorado))
      ) {
        type = 'protetiva';
      }else if(!firstPosition.medidaProtetiva && !secondPosition.medidaProtetiva)
      {
        type = 'generico';
      }
      else{
        continue;
      }
      encounters.push({
        tipo: type,
        monitoradosEncontro: [firstPosition.idMonitorado, secondPosition.idMonitorado],
        timestamp: firstPosition.timestamp,
        posicoes: 
        {
        [firstPosition.idMonitorado]: {
          lat: firstPosition.latitude,
          lon: firstPosition.longitude,
        },
        [secondPosition.idMonitorado]: {
          lat: secondPosition.latitude,
          lon: secondPosition.longitude,
        }
        },
      distanciaMetros: distance,
    });
    }
  }

  return encounters;
}
async function writeEncountersToFile(datasetFileName, encounters) {
  const outputDirectory = path.join(__dirname, 'Respostas');
  const datasetName = path.basename(datasetFileName, path.extname(datasetFileName));
  const outputFileName = `respostas_${datasetName}.json`;

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(
    path.join(outputDirectory, outputFileName),
    JSON.stringify(encounters, null, 2),
    'utf8',
  );
}

async function processDataSet(fileName) {
  const encounters = [];
  const datasetPath = path.join(__dirname, 'Datasets', fileName);
  const input = readline.createInterface({
    input: createReadStream(datasetPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  let headerRead = false;
  let currentTimestamp = null;
  let currentPositions = [];
  let positionsCount = 0;

  const processTimestamp = () => {
    if (currentPositions.length === 0) {
      return;
    }

    encounters.push(...searchPairInDataset(currentPositions));
    currentPositions = [];
  };

  try {
    for await (const line of input) {
      lineNumber += 1;
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      if (!headerRead) {
        const header = trimmedLine.split(';');
        if (header.length !== 7) {
          throw new Error('Cabeçalho inválido: esperado 7 colunas.');
        }
        headerRead = true;
        continue;
      }

      const position = preparePosition(
        parsePosition(trimmedLine, lineNumber),
      );
      positionsCount += 1;

      if (currentTimestamp !== null && position.timestamp !== currentTimestamp) {
        processTimestamp();
      }

      currentTimestamp = position.timestamp;
      currentPositions.push(position);
    }
  } finally {
    input.close();
  }

  if (!headerRead) {
    throw new Error('Dataset vazio ou sem cabeçalho.');
  }

  processTimestamp();
  await writeEncountersToFile(fileName, encounters);
  console.log(`${fileName}: ${positionsCount} linhas lidas, ${encounters.length} encontros encontrados.`);
}

async function main() {
  try {
    const datasetsDirectory = path.join(__dirname, 'Datasets');
    const datasetFileNames = (await fs.readdir(datasetsDirectory))
      .filter((fileName) => /^dataset\d+\.txt$/i.test(fileName))
      .sort((firstFileName, secondFileName) => {
        const firstNumber = Number(firstFileName.match(/\d+/)[0]);
        const secondNumber = Number(secondFileName.match(/\d+/)[0]);
        return firstNumber - secondNumber;
      });

    if (datasetFileNames.length === 0) {
      throw new Error('Nenhum arquivo datasetN.txt foi encontrado.');
    }

    for (const fileName of datasetFileNames) {
      await processDataSet(fileName);
    }
  } catch (error) {
    console.error('Erro ao processar os datasets - ', error.message);
    process.exitCode = 1;
  }
}

main();
