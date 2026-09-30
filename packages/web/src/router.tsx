import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import { AppHome } from './pages/AppHome';
import { DocumentView } from './pages/DocumentView';
import { InboxView } from './pages/InboxView';
import { ProjectLayout } from './pages/ProjectLayout';
import { Root } from './pages/Root';
import { OutputEditorPage, RuleEditorPage } from './pages/RuleEditor';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TypeView } from './pages/TypeView';

const rootRoute = createRootRoute({ component: Root, notFoundComponent: () => <PageMessage title="Page not found" /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: AppHome });
const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$repo/$project', component: ProjectLayout });
const inboxRoute = createRoute({ getParentRoute: () => projectRoute, path: '/', component: InboxView });
const typeRoute = createRoute({ getParentRoute: () => projectRoute, path: 't/$type', component: TypeView });
const docRoute = createRoute({ getParentRoute: () => projectRoute, path: 'd/$doc', component: DocumentView });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage });
const rulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules', component: RulesPage });
const ruleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/$file', component: RuleEditorPage });
const outputRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/outputs/$name', component: OutputEditorPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([inboxRoute, typeRoute, docRoute]),
  settingsRoute,
  rulesRoute,
  ruleRoute,
  outputRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
