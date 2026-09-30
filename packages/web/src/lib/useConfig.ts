import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: api.config });
