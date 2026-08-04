import { fractalActivitiesApi } from './fractalActivitiesApi';
import { fractalGoalsApi } from './fractalGoalsApi';
import { fractalMetaApi } from './fractalMetaApi';
import { fractalNotesApi } from './fractalNotesApi';
import { fractalProgramsApi } from './fractalProgramsApi';
import { fractalSessionsApi } from './fractalSessionsApi';
import { fractalCircuitsApi } from './fractalCircuitsApi';

export const fractalApi = {
    ...fractalGoalsApi,
    ...fractalSessionsApi,
    ...fractalActivitiesApi,
    ...fractalProgramsApi,
    ...fractalNotesApi,
    ...fractalMetaApi,
    ...fractalCircuitsApi,
};
