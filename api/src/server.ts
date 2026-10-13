import { createApp } from './app';
import { connectDB } from './config/connectDB';
import { config, validateConfig } from './config/env';

async function main(): Promise<void> {
  validateConfig();
  const connection = await connectDB();
  const app = createApp(connection);

  app.listen(config.port, () => {
    console.log(JSON.stringify({ event: 'server_started', port: config.port }));
  });
}

main().catch((err) => {
  console.error('Error al arrancar el servidor:', err);
  process.exit(1);
});
