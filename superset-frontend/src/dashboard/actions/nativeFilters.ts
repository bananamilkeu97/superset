/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  FilterConfiguration,
  Filters,
  makeApi,
  NativeFiltersState,
} from '@superset-ui/core';
import { Dispatch } from 'redux';
import { cloneDeep } from 'lodash';
import {
  SET_DATA_MASK_FOR_FILTER_CONFIG_FAIL,
  setDataMaskForFilterChangesComplete,
} from 'src/dataMask/actions';
import { areObjectsEqual } from 'src/reduxUtils';
import { HYDRATE_DASHBOARD } from './hydrate';
import { dashboardInfoChanged, dashboardInfoPatched } from './dashboardInfo';
import { DashboardInfo } from '../types';
import { FilterChanges } from '../components/nativeFilters/FiltersConfigModal/types';

export const SET_FILTER_CONFIG_BEGIN = 'SET_FILTER_CONFIG_BEGIN';
export interface SetFilterConfigBegin {
  type: typeof SET_FILTER_CONFIG_BEGIN;
  filterConfig: FilterConfiguration;
}

export const SET_FILTER_CONFIG_COMPLETE = 'SET_FILTER_CONFIG_COMPLETE';
export interface SetFilterConfigComplete {
  type: typeof SET_FILTER_CONFIG_COMPLETE;
  filterConfig: FilterConfiguration;
}
export const SET_FILTER_CHANGES_COMPLETE = 'SET_FILTER_CHANGES_COMPLETE';
export interface SetFilterChangesComplete {
  type: typeof SET_FILTER_CHANGES_COMPLETE;
  filterChanges: FilterChanges;
}

export const SET_FILTER_CONFIG_FAIL = 'SET_FILTER_CONFIG_FAIL';
export interface SetFilterConfigFail {
  type: typeof SET_FILTER_CONFIG_FAIL;
  filterConfig: FilterConfiguration;
}
export const SET_IN_SCOPE_STATUS_OF_FILTERS = 'SET_IN_SCOPE_STATUS_OF_FILTERS';
export interface SetInScopeStatusOfFilters {
  type: typeof SET_IN_SCOPE_STATUS_OF_FILTERS;
  filterConfig: FilterConfiguration;
}

const mergeFilters = (
  oldFilters: Partial<NativeFiltersState>,
  newFilters: Array<Partial<NativeFiltersState>>,
) =>
  newFilters.reduce((merged, newFilter) => {
    const { id } = newFilter;

    if (oldFilters[id]) {
      return {
        ...merged,
        [id]: { ...oldFilters[id], ...newFilter },
      };
    }

    return merged;
  }, {});

const cleanModifiedFilters = (prevState, filterChanges, mergedFilters) => {
  const modifiedCopy = filterChanges.modified.filter(newFilter => {
    const { id } = newFilter;

    const oldFilter = prevState[id];
    const mergedFilter = mergedFilters[id];

    const stateComparison = areObjectsEqual(mergedFilter, oldFilter, {
      ignoreUndefined: true,
    });

    return !stateComparison;
  });

  return {
    ...filterChanges,
    modified: modifiedCopy,
  };
};

const isFilterChangesEmpty = filterChanges =>
  Object.values(filterChanges).every(
    array => Array.isArray(array) && array.length === 0,
  );

export const setFilterConfiguration =
  (filterChanges: FilterChanges) =>
  async (dispatch: Dispatch, getState: () => any) => {
    const { id } = getState().dashboardInfo;
    const oldFilters = getState().nativeFilters?.filters;
    const cleanedFilterChanges = filterChanges;
    if (filterChanges.modified.length !== 0) {
      const mergedFilters = mergeFilters(oldFilters, filterChanges.modified);
      cleanedFilterChanges = cleanModifiedFilters(
        oldFilters,
        filterChanges,
        mergedFilters,
      );
    }
    if (isFilterChangesEmpty(cleanedFilterChanges)) {
      console.log('There are no changes to be made!');
      return;
    }
    dispatch({
      type: SET_FILTER_CONFIG_BEGIN,
      cleanedFilterChanges,
    });

    const updateFilters = makeApi<
      Partial<DashboardInfo>,
      { result: DashboardInfo }
    >({
      method: 'PATCH',
      endpoint: `/api/v1/dashboard/${id}`,
    });

    try {
      const response = await updateFilters({
        ...cleanedFilterChanges,
      });
      dispatch(dashboardInfoPatched(response.result));
      dispatch({
        type: SET_FILTER_CHANGES_COMPLETE,
        filterChanges: { ...cleanedFilterChanges },
      });
      dispatch(
        setDataMaskForFilterChangesComplete(cleanedFilterChanges, oldFilters),
      );
    } catch (err) {
      dispatch({
        type: SET_FILTER_CONFIG_FAIL,
        filterConfig: cleanedFilterChanges,
      });
      dispatch({
        type: SET_DATA_MASK_FOR_FILTER_CONFIG_FAIL,
        filterConfig: cleanedFilterChanges,
      });
    }
  };

export const setInScopeStatusOfFilters =
  (
    filterScopes: {
      filterId: string;
      chartsInScope: number[];
      tabsInScope: string[];
    }[],
  ) =>
  async (dispatch: Dispatch, getState: () => any) => {
    const filters = getState().nativeFilters?.filters;
    const filtersWithScopes = filterScopes.map(scope => ({
      ...filters[scope.filterId],
      chartsInScope: scope.chartsInScope,
      tabsInScope: scope.tabsInScope,
    }));
    dispatch({
      type: SET_IN_SCOPE_STATUS_OF_FILTERS,
      filterConfig: filtersWithScopes,
    });
    // need to update native_filter_configuration in the dashboard metadata
    const metadata = cloneDeep(getState().dashboardInfo.metadata);
    const filterConfig: FilterConfiguration =
      metadata.native_filter_configuration;
    const mergedFilterConfig = filterConfig.map(filter => {
      const filterWithScope = filtersWithScopes.find(
        scope => scope.id === filter.id,
      );
      if (!filterWithScope) {
        return filter;
      }
      return { ...filterWithScope, ...filter };
    });
    metadata.native_filter_configuration = mergedFilterConfig;
    dispatch(
      dashboardInfoChanged({
        metadata,
      }),
    );
  };

type BootstrapData = {
  nativeFilters: {
    filters: Filters;
    filtersState: object;
  };
};

export interface SetBootstrapData {
  type: typeof HYDRATE_DASHBOARD;
  data: BootstrapData;
}

export const SET_FOCUSED_NATIVE_FILTER = 'SET_FOCUSED_NATIVE_FILTER';
export interface SetFocusedNativeFilter {
  type: typeof SET_FOCUSED_NATIVE_FILTER;
  id: string;
}
export const UNSET_FOCUSED_NATIVE_FILTER = 'UNSET_FOCUSED_NATIVE_FILTER';
export interface UnsetFocusedNativeFilter {
  type: typeof UNSET_FOCUSED_NATIVE_FILTER;
}

export function setFocusedNativeFilter(id: string): SetFocusedNativeFilter {
  return {
    type: SET_FOCUSED_NATIVE_FILTER,
    id,
  };
}
export function unsetFocusedNativeFilter(): UnsetFocusedNativeFilter {
  return {
    type: UNSET_FOCUSED_NATIVE_FILTER,
  };
}

export const SET_HOVERED_NATIVE_FILTER = 'SET_HOVERED_NATIVE_FILTER';
export interface SetHoveredNativeFilter {
  type: typeof SET_HOVERED_NATIVE_FILTER;
  id: string;
}
export const UNSET_HOVERED_NATIVE_FILTER = 'UNSET_HOVERED_NATIVE_FILTER';
export interface UnsetHoveredNativeFilter {
  type: typeof UNSET_HOVERED_NATIVE_FILTER;
}

export function setHoveredNativeFilter(id: string): SetHoveredNativeFilter {
  return {
    type: SET_HOVERED_NATIVE_FILTER,
    id,
  };
}
export function unsetHoveredNativeFilter(): UnsetHoveredNativeFilter {
  return {
    type: UNSET_HOVERED_NATIVE_FILTER,
  };
}

export const UPDATE_CASCADE_PARENT_IDS = 'UPDATE_CASCADE_PARENT_IDS';
export interface UpdateCascadeParentIds {
  type: typeof UPDATE_CASCADE_PARENT_IDS;
  id: string;
  parentIds: string[];
}
export function updateCascadeParentIds(
  id: string,
  parentIds: string[],
): UpdateCascadeParentIds {
  return {
    type: UPDATE_CASCADE_PARENT_IDS,
    id,
    parentIds,
  };
}

export type AnyFilterAction =
  | SetFilterConfigBegin
  | SetFilterConfigComplete
  | SetFilterChangesComplete
  | SetFilterConfigFail
  | SetInScopeStatusOfFilters
  | SetBootstrapData
  | SetFocusedNativeFilter
  | UnsetFocusedNativeFilter
  | SetHoveredNativeFilter
  | UnsetHoveredNativeFilter
  | UpdateCascadeParentIds;
