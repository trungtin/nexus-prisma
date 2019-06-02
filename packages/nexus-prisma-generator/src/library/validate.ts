import { PrismaSchemaConfig } from './types'

export function validateOptions(options: PrismaSchemaConfig): void {
  if (!options.photon) {
    throw new Error(
      'Missing `prisma.photon` property in `makePrismaSchema({ photon: ... })`',
    )
  }

  if (
    typeof options.photon !== 'function' &&
    typeof options.photon !== 'string'
  ) {
    throw new Error(
      `\
Invalid \`photon\` property in \`makePrismaSchema({ photon: ... })\`.
This should either be the name of photon in your GraphQL server context, or a function that returns the photon instance from your GraphQL server context
`,
    )
  }
}
