export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RlEndpoint {
  key: string
  name: string
  method: HttpMethod
}

export interface RlCategory {
  name: string
  endpoints: RlEndpoint[]
}

export const RL_CATEGORIES: RlCategory[] = [
  {
    name: 'Tasks',
    endpoints: [
      { key: 'tasks.getAll',              name: 'Get all tasks',                      method: 'GET' },
      { key: 'tasks.create',              name: 'Create a task',                      method: 'POST' },
      { key: 'tasks.getById',             name: 'Get task by Id',                     method: 'GET' },
      { key: 'tasks.updateById',          name: 'Update task by Id',                  method: 'PUT' },
      { key: 'tasks.deleteById',          name: 'Delete task by Id',                  method: 'DELETE' },
      { key: 'tasks.addAssignees',        name: 'Add assignees to a task',            method: 'POST' },
      { key: 'tasks.removeAssignees',     name: 'Remove assignees from a task',       method: 'POST' },
      { key: 'tasks.addFollowers',        name: 'Add followers to a task',            method: 'POST' },
      { key: 'tasks.removeFollowers',     name: 'Remove followers from a task',       method: 'POST' },
      { key: 'tasks.addDependencies',     name: 'Add dependencies to a task',         method: 'POST' },
      { key: 'tasks.removeDependencies',  name: 'Remove dependencies from a task',    method: 'POST' },
      { key: 'tasks.moveToPhase',         name: 'Move a task to phase by Id',         method: 'POST' },
    ],
  },
  {
    name: 'Projects',
    endpoints: [
      { key: 'projects.getAll',              name: 'Get all projects',                        method: 'GET' },
      { key: 'projects.create',              name: 'Create a project',                        method: 'POST' },
      { key: 'projects.getById',             name: 'Get project by Id',                       method: 'GET' },
      { key: 'projects.updateById',          name: 'Update project by Id',                    method: 'PUT' },
      { key: 'projects.deleteById',          name: 'Delete project by Id',                    method: 'DELETE' },
      { key: 'projects.addMembers',          name: 'Add members to a project',                method: 'POST' },
      { key: 'projects.removeMembers',       name: 'Remove members from a project',           method: 'POST' },
      { key: 'projects.archive',             name: 'Archive project by Id',                   method: 'POST' },
      { key: 'projects.importTemplate',      name: 'Import a template to a project',          method: 'POST' },
      { key: 'projects.assignPlaceholders',  name: 'Assign placeholders to user in project',  method: 'POST' },
      { key: 'projects.unassignPlaceholders',name: 'Unassign placeholders from user',         method: 'POST' },
      { key: 'projects.getPlaceholders',     name: 'Get placeholders',                        method: 'POST' },
    ],
  },
  {
    name: 'Phases',
    endpoints: [
      { key: 'phases.getAll',    name: 'Get all phases',      method: 'GET' },
      { key: 'phases.create',    name: 'Create a phase',      method: 'POST' },
      { key: 'phases.getById',   name: 'Get phase by Id',     method: 'GET' },
      { key: 'phases.updateById',name: 'Update phase by Id',  method: 'PUT' },
      { key: 'phases.deleteById',name: 'Delete phase by Id',  method: 'DELETE' },
    ],
  },
  {
    name: 'Users',
    endpoints: [
      { key: 'users.getAll',  name: 'Get all users',    method: 'GET' },
      { key: 'users.getById', name: 'Get user by Id',   method: 'GET' },
    ],
  },
  {
    name: 'Fields',
    endpoints: [
      { key: 'fields.getAll',      name: 'Get all fields',       method: 'GET' },
      { key: 'fields.create',      name: 'Create a field',       method: 'POST' },
      { key: 'fields.getById',     name: 'Get field by Id',      method: 'GET' },
      { key: 'fields.updateById',  name: 'Update field by Id',   method: 'PUT' },
      { key: 'fields.deleteById',  name: 'Delete field by Id',   method: 'DELETE' },
      { key: 'fields.addOption',   name: 'Add field option',     method: 'POST' },
      { key: 'fields.updateOption',name: 'Update field option',  method: 'POST' },
    ],
  },
  {
    name: 'Resource Allocations',
    endpoints: [
      { key: 'resourceAllocations.getAll', name: 'Get all resource allocations', method: 'GET' },
    ],
  },
  {
    name: 'Time Tracking',
    endpoints: [
      { key: 'timeTracking.getAll',       name: 'Get all time entries',        method: 'GET' },
      { key: 'timeTracking.create',       name: 'Create a time entry',         method: 'POST' },
      { key: 'timeTracking.getById',      name: 'Get a time entry by Id',      method: 'GET' },
      { key: 'timeTracking.updateById',   name: 'Update a time entry',         method: 'PUT' },
      { key: 'timeTracking.deleteById',   name: 'Delete a time entry',         method: 'DELETE' },
      { key: 'timeTracking.search',       name: 'Search time entries',         method: 'GET' },
      { key: 'timeTracking.getCategories',name: 'Get time entry categories',   method: 'GET' },
    ],
  },
  {
    name: 'Time-Offs',
    endpoints: [
      { key: 'timeOffs.getAll',    name: 'Get all time-offs',    method: 'GET' },
      { key: 'timeOffs.create',    name: 'Create a time-off',    method: 'POST' },
      { key: 'timeOffs.getById',   name: 'Get time-off by Id',   method: 'GET' },
      { key: 'timeOffs.deleteById',name: 'Delete a time-off',    method: 'DELETE' },
    ],
  },
  {
    name: 'Spaces',
    endpoints: [
      { key: 'spaces.getAll',    name: 'Get all spaces',    method: 'GET' },
      { key: 'spaces.create',    name: 'Create a space',    method: 'POST' },
      { key: 'spaces.getById',   name: 'Get space by Id',   method: 'GET' },
      { key: 'spaces.updateById',name: 'Update space by Id',method: 'PUT' },
      { key: 'spaces.deleteById',name: 'Delete space by Id',method: 'DELETE' },
    ],
  },
  {
    name: 'Space Documents',
    endpoints: [
      { key: 'spaceDocs.getAll',    name: 'Get all space documents',        method: 'GET' },
      { key: 'spaceDocs.create',    name: 'Create a space document',        method: 'POST' },
      { key: 'spaceDocs.getById',   name: 'Get space document by Id',       method: 'GET' },
      { key: 'spaceDocs.updateById',name: 'Update space document by Id',    method: 'PUT' },
      { key: 'spaceDocs.deleteById',name: 'Delete space document by Id',    method: 'DELETE' },
    ],
  },
  {
    name: 'Invoices',
    endpoints: [
      { key: 'invoices.getAll',      name: 'Get all invoices',                        method: 'GET' },
      { key: 'invoices.getById',     name: 'Get invoice by Id',                       method: 'GET' },
      { key: 'invoices.getPayments', name: 'Get invoice payments by invoice Id',      method: 'GET' },
      { key: 'invoices.getLineItems',name: 'Get invoice line items by invoice Id',    method: 'GET' },
    ],
  },
]

export const DOCS_STORAGE_KEY = 'rl_api_docs'

export function loadApiDocs(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DOCS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function saveApiDocs(docs: Record<string, string>): void {
  localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(docs))
}
