import { writeFileSync } from 'fs'
import {
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  introspectionFromSchema,
  isEnumType,
  isInputObjectType,
  isObjectType,
  isScalarType,
} from 'graphql'
import { EOL } from 'os'
import { ISDL } from 'prisma-datamodel'
import { getImportPathRelativeToOutput } from './config'
import { getFinalType, getTypeName, isList, isRequired } from './graphql'
import { sep } from 'path'

export function renderTypes(opts: {
  prismaClientDir: string
  output: string
  schema: GraphQLSchema
}) {
  const { prismaClientDir, output, schema } = opts

  try {
    const nexusPrismaTypes = renderNexusPrismaTypes(
      schema,
      prismaClientDir.startsWith('.') || prismaClientDir.startsWith(sep)
        ? getImportPathRelativeToOutput(prismaClientDir, output)
        : prismaClientDir,
    )

    writeFileSync(output, nexusPrismaTypes)
  } catch (e) {
    console.error(e)
  }
}

export function renderDatamodelInfo(
  datamodel: ISDL,
  schema: GraphQLSchema,
  exportString: string,
) {
  return `\
${exportString} {
  uniqueFieldsByModel: {
${datamodel.types
  .map(
    type =>
      `    ${type.name}: [${type.fields
        .filter(field => field.isUnique)
        .map(field => `'${field.name}'`)
        .join(', ')}]`,
  )
  .join(',' + EOL)}
  },
  embeddedTypes: [${datamodel.types
    .filter(t => t.isEmbedded)
    .map(t => `'${t.name}'`)
    .join(', ')}],
  schema: ${JSON.stringify(introspectionFromSchema(schema), null, 2)}
}
  `
}

function renderNexusPrismaTypes(
  schema: GraphQLSchema,
  prismaClientPath: string,
) {
  const types = Object.values(schema.getTypeMap())
  const objectTypes = types.filter(
    t => isObjectType(t) && !t.name.startsWith('__') && t.name !== 'Node',
  ) as GraphQLObjectType[]
  const inputTypes = types.filter(isInputObjectType)
  const enumTypes = types.filter(
    t => isEnumType(t) && !t.name.startsWith('__'),
  ) as GraphQLEnumType[]

  return `\
import { core } from 'nexus'
import { GraphQLResolveInfo } from 'graphql'
import * as prisma from '${prismaClientPath}'

export interface NexusPrismaGen extends NexusPrismaTypes {}

export interface NexusPrismaTypes {
  objectTypes: {
    fields: {
${objectTypes
  .map(type => `      ${type.name}: ${getObjectTypeFieldsName(type)}`)
  .join(EOL)}
    }
    fieldsDetails: {
${objectTypes
  .map(type => `      ${type.name}: ${getObjectTypeFieldsDetailsName(type)}`)
  .join(EOL)}
    }
  }
  inputTypes: {
    fields: {
${inputTypes
  .map(
    type =>
      `      ${getInputObjectTypeName(type)}: ${getInputObjectTypeFieldsName(
        type,
      )}`,
  )
  .join(EOL)}
    }
  }
  enumTypes: {
${enumTypes
  .map(type => `    ${type.name}: ${getEnumTypeName(type)},`)
  .join(EOL)}
  }
}

${objectTypes.map(renderObjectType).join(EOL)}

${inputTypes.map(renderInputType).join(EOL)}

${enumTypes.map(renderEnumType).join(EOL)}
  `
}

function renderObjectType(type: GraphQLObjectType) {
  const fields = Object.values(type.getFields())
  const fieldsWithoutQueryNode = removeQueryNodeField(type, fields)

  return `\
// Types for ${type.name}

${renderFields(type, fieldsWithoutQueryNode)}

${renderFieldsArgs(type, fieldsWithoutQueryNode)}

${renderTypeFieldDetails(type, fieldsWithoutQueryNode)}
`
}

function renderTypeFieldDetails(
  type: GraphQLObjectType,
  fields: GraphQLField<any, any>[],
) {
  return `\
export interface ${getObjectTypeFieldsDetailsName(type)} {
${fields
  .map(
    field => `\
  ${field.name}: {
    type: '${getTypeName(field.type)}'
    args: ${
      field.args.length > 0
        ? `Record<${getTypeFieldArgName(
            type,
            field,
          )}, core.NexusArgDef<string>>`
        : '{}'
    }
    description: string
    list: ${isList(field.type) ? true : undefined}
    nullable: ${!isRequired(field.type)}
    resolve: ${
      isScalarType(getFinalType(field.type))
        ? undefined
        : `(
      root: core.RootValue<"${type.name}">,
      args: ${renderResolverArgs(field)},
      context: core.GetGen<"context">,
      info?: GraphQLResolveInfo
    ) => ${renderResolverReturnType(field)}`
    }
  }`,
  )
  .join(EOL)}
}
  `
}

function renderResolverArgs(field: GraphQLField<any, any>) {
  return `{\
 ${field.args
   .map(
     arg => `${arg.name}${isRequired(arg.type) ? '' : '?'}: ${getTSType(arg)}`,
   )
   .join(', ')} }\
  `
}

function renderFields(
  type: GraphQLObjectType,
  fields: GraphQLField<any, any>[],
) {
  return `\
type ${getObjectTypeFieldsName(type)} =
  | ${getExposableFieldsTypeName(type)}
${fields
  .map(
    f =>
      `  | { name: '${f.name}', args?: ${
        f.args.length > 0
          ? `${getTypeFieldArgName(type, f)}[] | false`
          : '[] | false'
      }, alias?: string  } `,
  )
  .join(EOL)}

type ${getExposableFieldsTypeName(type)} =
${fields.map(f => `  | '${f.name}'`).join(EOL)}
`
}

function renderFieldsArgs(
  type: GraphQLObjectType,
  fields: GraphQLField<any, any>[],
) {
  return `\
${fields
  .filter(field => field.args.length > 0)
  .map(field => renderFieldArg(type, field))
  .join(EOL)}
  `
}

function renderFieldArg(
  type: GraphQLObjectType,
  field: GraphQLField<any, any>,
) {
  return `\
type ${getTypeFieldArgName(type, field)} =
${field.args.map(arg => `  | '${arg.name}'`).join(EOL)}`
}

function getTSType(graphqlType: GraphQLField<any, any> | GraphQLInputField) {
  const graphqlToTypescript: Record<string, string> = {
    String: 'string',
    Boolean: 'boolean',
    ID: 'string',
    Int: 'number',
    Float: 'number',
    DateTime: 'string',
  }
  const finalType = getFinalType(graphqlType.type)

  let returnType = ''

  if (isScalarType(finalType)) {
    returnType = graphqlToTypescript[getTypeName(finalType)]
  } else if (isInputObjectType(finalType)) {
    returnType = getInputObjectTypeName(finalType)
  } else {
    returnType = `prisma.${getTypeName(finalType)}`
  }

  if (isList(graphqlType.type)) {
    returnType += '[]'
  }

  if (!isRequired(graphqlType.type)) {
    returnType += ' | null'
  }

  return returnType
}

function renderResolverReturnType(field: GraphQLField<any, any>) {
  const returnType = getTSType(field)

  return `Promise<${returnType}> | ${returnType}`
}

function renderInputType(input: GraphQLInputObjectType) {
  const fields = Object.values(input.getFields())
  return `\
export interface ${getInputObjectTypeName(input)} {
${fields
  .map(
    field =>
      `  ${field.name}${isRequired(input) ? '' : '?'}: ${getTSType(field)}`,
  )
  .join(EOL)}
}
export type ${getInputObjectTypeFieldsName(input)} =
  | Extract<keyof ${getInputObjectTypeName(input)}, string>
${fields.map(f => `  | { name: '${f.name}', alias?: string  } `).join(EOL)}
  `
}

function renderEnumType(enumType: GraphQLEnumType): string {
  return `\
export type ${getEnumTypeName(enumType)} =
${enumType
  .getValues()
  .map(value => `  | '${value.name}'`)
  .join(EOL)}
  `
}

function getExposableFieldsTypeName(type: GraphQLObjectType) {
  return `${type.name}Fields`
}

function upperFirst(s: string) {
  return s.replace(/^\w/, c => c.toUpperCase())
}

function removeQueryNodeField(
  type: GraphQLObjectType,
  fields: GraphQLField<any, any>[],
) {
  if (type.name === 'Query') {
    fields = fields.filter(field => field.name !== 'node')
  }

  return fields
}

function getTypeFieldArgName(
  type: GraphQLObjectType,
  field: GraphQLField<any, any>,
) {
  return `${type.name}${upperFirst(field.name)}Args`
}

function getObjectTypeFieldsName(type: GraphQLObjectType) {
  return `${type.name}Object`
}

function getInputObjectTypeFieldsName(type: GraphQLInputObjectType) {
  return `${type.name}InputObject`
}

function getObjectTypeFieldsDetailsName(type: GraphQLObjectType) {
  return `${type.name}FieldDetails`
}

function getInputObjectTypeName(type: GraphQLInputObjectType) {
  return `${type.name}`
}

function getEnumTypeName(enumType: GraphQLEnumType): string {
  return `${enumType.name}Values`
}
