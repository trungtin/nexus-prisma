import * as Ajv from 'ajv'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'
import { DatabaseType, DefaultParser, ISDL } from 'prisma-datamodel'
import { PrismaDefinition } from 'prisma-json-schema'
const schema = require('prisma-json-schema/dist/schema.json')

const ajv = new Ajv().addMetaSchema(
  require('ajv/lib/refs/json-schema-draft-06.json'),
)

const validate = ajv.compile(schema)

export function findDatamodelAndComputeSchema(
  configPath: string,
  config: PrismaDefinition,
): {
  datamodel: ISDL
  databaseType: DatabaseType
} {
  const typeDefs = getTypesString(config.datamodel!, path.dirname(configPath))
  const databaseType = getDatabaseType(config)
  const ParserInstance = DefaultParser.create(databaseType)

  return {
    datamodel: ParserInstance.parseFromSchemaString(typeDefs),
    databaseType,
  }
}

export function readPrismaYml(configPath: string) {
  if (!fs.existsSync(configPath)) {
    throw new Error('Could not find `prisma.yml` file')
  }

  try {
    const file = fs.readFileSync(configPath, 'utf-8')
    const config = yaml.safeLoad(file) as PrismaDefinition

    const valid = validate(config)

    if (!valid) {
      let errorMessage =
        `Invalid prisma.yml file` + '\n' + ajv.errorsText(validate.errors)
      throw new Error(errorMessage)
    }

    if (!config.datamodel) {
      throw new Error('Invalid prisma.yml file: Missing `datamodel` property')
    }

    if (!config.generate) {
      throw new Error(
        'Invalid prisma.yml file: Missing `generate` property for a `prisma-client`',
      )
    }

    return { config, configPath }
  } catch (e) {
    throw new Error(`Yaml parsing error in ${configPath}: ${e.message}`)
  }
}

function getTypesString(datamodel: string | string[], definitionDir: string) {
  const typesPaths = datamodel
    ? Array.isArray(datamodel)
      ? datamodel
      : [datamodel]
    : []

  let allTypes = ''

  typesPaths.forEach(unresolvedTypesPath => {
    const typesPath = path.join(definitionDir, unresolvedTypesPath!)
    if (fs.existsSync(typesPath)) {
      const types = fs.readFileSync(typesPath, 'utf-8')
      allTypes += types + '\n'
    } else {
      throw new Error(
        `The types definition file "${typesPath}" could not be found.`,
      )
    }
  })

  return allTypes
}

export function getImportPathRelativeToOutput(
  importPath: string,
  outputDir: string,
): string {
  let relativePath = path.relative(path.dirname(outputDir), importPath)

  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }

  // remove .ts or .js file extension
  relativePath = relativePath.replace(/\.(ts|js)$/, '')

  // remove /index
  relativePath = relativePath.replace(/\/index$/, '')

  // replace \ with /
  relativePath = relativePath.replace(/\\/g, '/')

  return relativePath
}

function getDatabaseType(definition: PrismaDefinition): DatabaseType {
  if (!definition.databaseType) {
    return DatabaseType.postgres
  }

  return definition.databaseType === 'document'
    ? DatabaseType.mongo
    : DatabaseType.postgres
}
