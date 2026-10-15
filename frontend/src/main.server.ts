import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Angular 21: se pasa el contexto (BootstrapContext) a bootstrapApplication.
// Sin él, NG0401 al renderizar cualquier página en SSR.
const bootstrap = (context: BootstrapContext) => bootstrapApplication(AppComponent, config, context);

export default bootstrap;
