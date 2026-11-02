# Desafio — Detecção de encontros

## Programa Trainee Tech Spacecom 2027

**Autor:** Paulo Vinicius Fernandes Taborda Grunte

---

## Visão geral

O programa recebe arquivos de posicionamento no formato CSV, utilizando ponto e
vírgula (`;`) como separador, e detecta encontros físicos entre pessoas
monitoradas.

Um encontro é válido quando duas posições do **mesmo timestamp** estão a uma
distância **menor que 20 metros**. A distância é calculada pela Fórmula de
Haversine, utilizando o raio da Terra de **6.371.000 metros**.

### Tipos de encontro

| Tipo | Regra |
|---|---|
| `faccao` | Dois monitorados/agressores pertencem à mesma facção. |
| `protetiva` | Um agressor encontra sua respectiva vítima, conforme os IDs da medida protetiva. |
| `generico` | Dois monitorados/agressores estão a menos de 20 metros, sem depender de facção. |

Vítima com vítima e agressor com vítima sem relação protetiva não são registrados.

---

## Estrutura do projeto

```text
SpaceCom_Desafio/
├── Datasets/
│   ├── dataset1.txt
│   ├── dataset2.txt
│   └── ...
├── Respostas/
│   └── respostas_datasetN.json
├── main.js
└── README.md
```

Os arquivos de entrada devem estar na pasta `Datasets/` e seguir o padrão
`datasetN.txt`. A pasta `Respostas/` é criada automaticamente caso não exista.

## Formato de entrada

Cada dataset deve possuir o cabeçalho:

```text
idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida
```

Exemplo:

```text
10;2;2024-01-01 00:00:00;-14.62734;-36.31860;false;
11;2;2024-01-01 00:00:00;-14.62731;-36.31869;false;
12;;2024-01-01 00:00:00;-7.33193;-65.93130;true;13
13;;2024-01-01 00:00:00;-7.33197;-65.93137;false;
```

Os registros são analisados somente quando possuem o timestamp exatamente igual.
Por exemplo, uma posição de `00:00:00` não é comparada com uma posição de
`00:00:05`.

## Como executar o programa

### Pré-requisito

É necessário ter o Node.js instalado:

```powershell
node --version
```

### Execução

No PowerShell, entre na pasta do projeto.

Execute o programa:

```powershell
node main.js
```

O programa localiza automaticamente todos os arquivos que seguem o padrão
`datasetN.txt`, ordena-os numericamente e processa cada um em sequência.
Arquivos como `dataset1 copy.txt` são ignorados.

## Saída esperada

Para cada entrada, é criado um arquivo com o padrão:

```text
Respostas/respostas_dataset1.json
Respostas/respostas_dataset2.json
Respostas/respostas_datasetN.json
```

Cada encontro possui a seguinte estrutura:

```json
{
  "tipo": "faccao",
  "monitoradosEncontro": [10, 11],
  "timestamp": "2024-01-01 00:00:00",
  "posicoes": {
    "10": {
      "lat": -14.62734,
      "lon": -36.3186
    },
    "11": {
      "lat": -14.62731,
      "lon": -36.31869
    }
  },
  "distanciaMetros": 10.816404740794491
}
```

O campo `distanciaMetros` contém a distância calculada pela Fórmula de
Haversine. O array final contém todos os encontros válidos do dataset.

### Saída no terminal

Durante a execução, o programa informa a quantidade de linhas lidas e de
encontros encontrados em cada arquivo:

```text
dataset1.txt: 5000 linhas lidas, 4 encontros encontrados.
dataset2.txt: 25000 linhas lidas, 6 encontros encontrados.
dataset3.txt: 100000 linhas lidas, 10 encontros encontrados.
dataset4.txt: 400020 linhas lidas, 15 encontros encontrados.
dataset5.txt: 1000000 linhas lidas, 21 encontros encontrados.
dataset6.txt: 8000000 linhas lidas, 27 encontros encontrados.
dataset7.txt: 12000000 linhas lidas, 35 encontros encontrados.
```

Se ocorrer um erro de leitura, validação ou processamento, uma mensagem é
exibida e o processo termina com código de saída `1`:

```text
Erro ao processar os datasets - <mensagem do erro>
```

## Explicação da lógica utilizada

### 1. Leitura e validação dos registros

A função `parsePosition` converte cada linha em um objeto JavaScript e valida:

- quantidade de colunas;
- ID numérico;
- formato do timestamp;
- latitude entre `-90` e `90`;
- longitude entre `-180` e `180`;
- valor booleano de `medidaProtetiva`.

```js
function parsePosition(line, lineNumber) {
  const columns = line.split(';').map(removeQuotes);

  if (columns.length !== 7) {
    throw new Error(
      `Linha ${lineNumber}: esperado 7 campos, mas foram encontrados ${columns.length}.`,
    );
  }

  // Conversão e validação dos campos...
}
```

Os IDs de restrição são transformados em um array de números:

```js
idsRestricaoMedida: restrictionIds
  ? restrictionIds.split(',').map(Number)
  : [],
```

### 2. Leitura em fluxo

O programa não carrega um dataset inteiro em memória. Ele usa `createReadStream`
e `readline` para ler uma linha por vez:

```js
const input = readline.createInterface({
  input: createReadStream(datasetPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of input) {
  // valida e processa uma linha
}
```

Essa escolha é importante para arquivos grandes, como o `dataset7.txt`. O uso
de memória fica proporcional ao maior grupo de posições de um timestamp, e não
ao tamanho total do arquivo.

### 3. Processamento por timestamp

As posições do timestamp atual são mantidas em `currentPositions`:

```js
if (currentTimestamp !== null && position.timestamp !== currentTimestamp) {
  processTimestamp();
}

currentTimestamp = position.timestamp;
currentPositions.push(position);
```

Quando o timestamp muda, o grupo anterior é enviado para
`searchPairInDataset`. Dessa forma, o programa nunca compara timestamps
diferentes.

### 4. Pré-cálculo geográfico

Antes de comparar pares, cada posição é preparada uma única vez:

```js
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
```

São armazenados:

- latitude em radianos;
- longitude em radianos;
- cosseno da latitude.

Isso evita repetir conversões e chamadas de `Math.cos` para todos os pares.

### 5. Filtro geográfico rápido

Antes da Haversine completa, `canBeWithinEncounterDistance` elimina pares que
já são claramente incapazes de estar a menos de 20 metros:

```js
function canBeWithinEncounterDistance(firstPosition, secondPosition) {
  const deltaLatitude = Math.abs(
    firstPosition.latitudeRadians - secondPosition.latitudeRadians,
  );

  if (EARTH_RADIUS_IN_METERS * deltaLatitude >= 20) {
    return false;
  }

  // Verificação equivalente para a longitude...
}
```

Esse filtro não substitui a Haversine. Ele apenas evita cálculos caros para
pares impossíveis. Os candidatos restantes ainda passam pelo cálculo exato.

### 6. Fórmula de Haversine

O cálculo exato é realizado em `calcDistance`:

```js
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
```

O raio utilizado é:

```js
const EARTH_RADIUS_IN_METERS = 6_371_000;
```

### 7. Busca e classificação dos pares

A função `searchPairInDataset` compara combinações sem repetir a ordem do par:

```js
for (let firstIndex = 0; firstIndex < clusteredPositions.length; firstIndex++) {
  for (
    let secondIndex = firstIndex + 1;
    secondIndex < clusteredPositions.length;
    secondIndex++
  ) {
    // compara o par atual
  }
}
```

Depois da distância, as regras são aplicadas:

```js
if (sameFaction) {
  type = 'faccao';
} else if (isProtectiveEncounter) {
  type = 'protetiva';
} else if (bothAreAggressors) {
  type = 'generico';
} else {
  continue;
}
```

No código, essas condições são avaliadas diretamente a partir de
`faccaoMonitorado`, `medidaProtetiva` e `idsRestricaoMedida`.

O par só é adicionado ao resultado depois de possuir um tipo válido:

```js
encounters.push({
  tipo: type,
  monitoradosEncontro: [
    firstPosition.idMonitorado,
    secondPosition.idMonitorado,
  ],
  timestamp: firstPosition.timestamp,
  posicoes: {
    [firstPosition.idMonitorado]: {
      lat: firstPosition.latitude,
      lon: firstPosition.longitude,
    },
    [secondPosition.idMonitorado]: {
      lat: secondPosition.latitude,
      lon: secondPosition.longitude,
    },
  },
  distanciaMetros: distance,
});
```

### 8. Geração dos arquivos

O nome de saída é criado a partir do nome do dataset:

```js
const datasetName = path.basename(
  datasetFileName,
  path.extname(datasetFileName),
);
const outputFileName = `respostas_${datasetName}.json`;
```

Assim, `dataset3.txt` gera `respostas_dataset3.json`.

## Ganhos de performance

### Leitura em fluxo

Evita transformar um arquivo grande inteiro em uma única string. Isso reduz o
consumo de memória e permite processar datasets que poderiam causar
`Invalid string length` quando lidos com `readFile`.

### Processamento por timestamp

Somente posições do timestamp atual ficam em memória. Além de respeitar a regra
do problema, isso evita manter todos os registros do dataset agrupados.

### Pré-cálculo

Conversões de graus para radianos e cossenos são executadas uma vez por posição,
em vez de serem repetidas durante cada comparação.

### Filtro geográfico

A Haversine envolve funções trigonométricas. O filtro preliminar elimina pares
distantes antes dessas operações, reduzindo o custo do laço de comparação.

### Serialização única

`searchPairInDataset` retorna um array diretamente:

```js
return encounters;
```

O resultado só é convertido para JSON no momento da gravação do arquivo. Isso
evita serializar e desserializar repetidamente os resultados.

### Complexidade

O algoritmo compara pares dentro de cada timestamp. No pior caso, um grupo com
`n` posições possui:

```text
n × (n - 1) / 2
```

comparações.

Na prática, o filtro geográfico reduz a quantidade de cálculos completos da
Haversine. A solução também evita uma estrutura espacial mais complexa, mantendo
o resultado exato e o código simples de validar.

## Por que esta abordagem?

Esta abordagem foi escolhida porque combina:

1. **Correção:** respeita timestamp exato, Haversine, raio de 20 metros e regras
   de classificação;
2. **Escalabilidade de memória:** usa leitura em fluxo e não carrega arquivos
   inteiros;
3. **Desempenho:** reaproveita cálculos trigonométricos e aplica filtros baratos;
4. **Rastreabilidade:** cada etapa possui uma responsabilidade clara;
5. **Robustez:** entradas inválidas geram erros explícitos;
6. **Automação:** todos os `datasetN.txt` são processados sem alterar o código.

## Execução verificada

O processamento foi validado com os datasets disponíveis e produziu:

```text
dataset1.txt: 5000 linhas lidas, 4 encontros encontrados.
dataset2.txt: 25000 linhas lidas, 6 encontros encontrados.
dataset3.txt: 100000 linhas lidas, 10 encontros encontrados.
dataset4.txt: 400020 linhas lidas, 15 encontros encontrados.
dataset5.txt: 1000000 linhas lidas, 21 encontros encontrados.
dataset6.txt: 8000000 linhas lidas, 27 encontros encontrados.
dataset7.txt: 12000000 linhas lidas, 35 encontros encontrados.
```
