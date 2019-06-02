import { GraphQLSchema } from 'graphql'
import { core } from 'nexus'
import { PrismaSchemaBuilder } from './builder'
import { PrismaSchemaConfig, InternalPrismaSchemaConfig } from './types'
import { validateOptions } from './validate'

export * from './definitions'

interface PrismaSchemaConfigRequiredTypes extends PrismaSchemaConfig {
  types: any
}

function isPhotonGenerated(): boolean {
  try {
    require.resolve('@generated/photon')
    return true
  } catch {
    return false
  }
}

export function makePrismaSchema(options: PrismaSchemaConfig): GraphQLSchema {
  if (!options.photon) {
    options.photon = 'photon'
  }

  if (!options.types) {
    options.types = []
  }

  if (isPhotonGenerated()) {
    if (!options.typegenAutoConfig) {
      options.typegenAutoConfig = {
        sources: [
          {
            source: '@generated/photon',
            alias: 'photon',
          },
        ],
      }
    } else {
      if (
        !options.typegenAutoConfig.sources.some(source =>
          source.source.includes('@generated/photon'),
        )
      ) {
        options.typegenAutoConfig.sources = [
          {
            source: '@generated/photon',
            alias: 'photon',
          },
          ...options.typegenAutoConfig.sources,
        ]
      }
    }
  }

  validateOptions(options)

  const builder = new PrismaSchemaBuilder(options as InternalPrismaSchemaConfig)

  const { schema } = core.makeSchemaInternal(
    options as PrismaSchemaConfigRequiredTypes,
    builder,
  )

  // Only in development envs do we want to worry about regenerating the
  // schema definition and/or generated types.
  const {
    shouldGenerateArtifacts = Boolean(
      !process.env.NODE_ENV || process.env.NODE_ENV === 'development',
    ),
  } = options

  if (shouldGenerateArtifacts) {
    // Generating in the next tick allows us to use the schema
    // in the optional thunk for the typegen config
    new core.TypegenMetadata(options).generateArtifacts(schema).catch(e => {
      console.error(e)
    })
  }

  return schema
}
