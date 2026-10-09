import { createRootRoute, createRoute, createRouter, type SearchSchemaInput } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import { AppHome } from './pages/AppHome';
import { DefensePage, type DefenseMode } from './pages/defense/DefensePage';
import { DocumentView } from './pages/DocumentView';
import { FinalizePage } from './pages/finalize/FinalizePage';
import { InboxView } from './pages/InboxView';
import { ProjectLayout } from './pages/ProjectLayout';
import { Root } from './pages/Root';
import { OutputEditorPage, RuleEditorPage } from './pages/RuleEditor';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThreadView } from './pages/ThreadView';
import { TypeView } from './pages/TypeView';
import { VersionPage } from './pages/versions/VersionPage';
import { VersionsPage } from './pages/versions/VersionsPage';

const rootRoute = createRootRoute({ component: Root, notFoundComponent: () => <PageMessage title="Page not found" /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: AppHome });
const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$repo/$project', component: ProjectLayout });
const inboxRoute = createRoute({ getParentRoute: () => projectRoute, path: '/', component: InboxView });
/** `?item=` opens one item on a visual screen: a diagram, a table, a UI screen or a flow. */
type TypeSearch = { item?: string };
const typeRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 't/$type',
  component: TypeView,
  validateSearch: (search: Record<string, unknown>): TypeSearch => (typeof search.item === 'string' && search.item ? { item: search.item } : {}),
});
const threadRoute = createRoute({ getParentRoute: () => projectRoute, path: 'th/$thread', component: ThreadView });
const docRoute = createRoute({ getParentRoute: () => projectRoute, path: 'd/$doc', component: DocumentView });
const finalizeRoute = createRoute({ getParentRoute: () => projectRoute, path: 'finalize', component: FinalizePage });
const versionsRoute = createRoute({ getParentRoute: () => projectRoute, path: 'versions', component: VersionsPage });
const versionRoute = createRoute({ getParentRoute: () => projectRoute, path: 'versions/$n', component: VersionPage });

/** `?mode=practice` opens Practice and `?mode=present` Present; anything else is Study. Links may leave the search out. */
type DefenseSearch = { mode: DefenseMode };
const defenseRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'defense',
  component: DefensePage,
  validateSearch: (search: { mode?: DefenseMode } & SearchSchemaInput): DefenseSearch => ({
    mode: search.mode === 'practice' || search.mode === 'present' ? search.mode : 'study',
  }),
});
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage });
const rulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules', component: RulesPage });
const ruleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/$file', component: RuleEditorPage });
const outputRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/outputs/$name', component: OutputEditorPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([inboxRoute, typeRoute, threadRoute, docRoute, finalizeRoute, versionsRoute, versionRoute, defenseRoute]),
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
