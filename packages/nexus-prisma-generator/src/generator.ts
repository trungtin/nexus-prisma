import * as fs from 'fs'
import { GraphQLSchema } from 'graphql'
import { join } from 'path'
import { ISDL } from 'prisma-datamodel'
import { generateCRUDSchemaFromInternalISDL } from 'prisma-generate-schema'
import { renderTypes, renderDatamodelInfo } from './types-generator'
import {
  findDatamodelAndComputeSchema,
  readPrismaYml,
} from './types-generator/config'
import { promisify } from 'util'

const copyFileAsync = promisify(fs.copyFile)

const INPUT_LIBRARY_DIR = join(__dirname, 'library')
const DIRS = ['blocks', 'definitions', 'graphqlToNexus', 'generated']
const STATIC_FILES = [
  'camelcase',
  'graphql',
  'index',
  'throw',
  'typesHelpers',
  'validate',
  'builder',
  'resolver',
  'types',
  'utils',
  join('blocks', 'objectType'),
  join('blocks', 'inputObjectType'),
  join('blocks', 'extendType'),
  join('definitions', 'index'),
  join('definitions', 'objectType'),
  join('definitions', 'inputObjectType'),
  join('definitions', 'enumType'),
  join('definitions', 'extendType'),
  join('graphqlToNexus', 'index'),
  join('graphqlToNexus', 'common'),
  join('graphqlToNexus', 'enumType'),
  join('graphqlToNexus', 'inputObjectType'),
  join('graphqlToNexus', 'objectType'),
]
const GENERATED_TYPES = 'generated/types.d.ts'
const DATAMODEL_INFO = 'generated/datamodelInfo.js'

export async function generate(
  prismaYmlPath: string,
  opts?: { clientDir?: string; outputPath?: string },
) {
  if (!opts) {
    opts = {}
  }
  if (!opts.clientDir) {
    opts.clientDir = '@generated/prisma-client'
  }
  if (!opts.outputPath) {
    opts.outputPath = join(__dirname, '..', '..', '@generated/nexus-prisma')
  }

  const { datamodel, schema } = readDatamodel(prismaYmlPath)
  const outputDirs = DIRS.map(dirPath => join(opts!.outputPath!, dirPath))
  ;[...outputDirs, opts.outputPath].forEach(path => {
    try {
      // Create the output directories if needed (mkdir -p)
      fs.mkdirSync(path, { recursive: true })
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
  })

  await copyStaticFiles(opts.outputPath)

  renderDynamicFiles(
    datamodel,
    schema,
    opts.clientDir || '@generated/prisma-client',
    opts.outputPath,
  )
}

function readDatamodel(prismaYmlPath: string) {
  const prisma = readPrismaYml(prismaYmlPath)

  const { datamodel, databaseType } = findDatamodelAndComputeSchema(
    prisma.configPath,
    prisma.config,
  )
  const schema = generateCRUDSchemaFromInternalISDL(datamodel, databaseType)

  return {
    datamodel,
    schema,
  }
}

async function copyStaticFiles(output: string) {
  const jsFilesPromises = STATIC_FILES.map(filePath =>
    copyFileAsync(
      join(INPUT_LIBRARY_DIR, filePath + '.js'),
      join(output, filePath + '.js'),
    ),
  )
  const dTSPromises = STATIC_FILES.map(filePath =>
    copyFileAsync(
      join(INPUT_LIBRARY_DIR, filePath + '.d.ts'),
      join(output, filePath + '.d.ts'),
    ),
  )

  return Promise.all([...jsFilesPromises, ...dTSPromises])
}

function renderDynamicFiles(
  datamodel: ISDL,
  schema: GraphQLSchema,
  clientDir: string,
  output: string,
) {
  const datamodelInfoPath = join(output, DATAMODEL_INFO)

  const datamodelInfo = renderDatamodelInfo(
    datamodel,
    schema,
    'module.exports =',
  )

  fs.writeFileSync(datamodelInfoPath, datamodelInfo)

  renderTypes({
    output: join(output, GENERATED_TYPES),
    prismaClientDir: clientDir,
    schema,
  })
}
