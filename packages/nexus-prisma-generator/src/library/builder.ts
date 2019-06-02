import { buildClientSchema, GraphQLNamedType } from 'graphql'
import { core } from 'nexus'
import { graphqlTypeToNexus } from './graphqlToNexus'
import { InternalDatamodelInfo, InternalPrismaSchemaConfig } from './types'

export class PrismaSchemaBuilder extends core.SchemaBuilder {
  private datamodelInfo: InternalDatamodelInfo

  constructor(protected config: InternalPrismaSchemaConfig) {
    super(config)

    const requiredDatamodelInfo = require('./generated/datamodelInfo')

    this.datamodelInfo = {
      ...requiredDatamodelInfo,
      schema: buildClientSchema(requiredDatamodelInfo.schema),
    }
  }

  protected missingType(typeName: string): GraphQLNamedType {
    const datamodelInfo = this.getDatamodelInfo()
    const type = datamodelInfo.schema.getType(typeName)

    if (type) {
      return graphqlTypeToNexus(this, type, this.config.photon, datamodelInfo)
    }

    return super.missingType(typeName)
  }

  public getConfig() {
    return this.config
  }

  public getDatamodelInfo() {
    return this.datamodelInfo
  }
}

export function isPrismaSchemaBuilder(obj: any): obj is PrismaSchemaBuilder {
  return obj && obj instanceof PrismaSchemaBuilder
}
