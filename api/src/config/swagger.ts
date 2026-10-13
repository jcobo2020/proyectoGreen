import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Greenfield Orders API',
      version: '1.0.0',
      description: 'API de catálogo de productos y gestión de pedidos',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        PublicProduct: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Identificador único del producto' },
            sku: { type: 'string', description: 'Código único del artículo' },
            name: { type: 'string', description: 'Nombre del producto' },
            unitPrice: { type: 'number', format: 'float', description: 'Precio unitario con 2 decimales' },
            available: { type: 'integer', description: 'Unidades disponibles' },
          },
          required: ['id', 'sku', 'name', 'unitPrice', 'available'],
        },
        ValidationError: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          required: ['code', 'message', 'details'],
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'UNAUTHORIZED' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
        InternalError: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'INTERNAL_ERROR' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
