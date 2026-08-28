import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public_endpoint';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
