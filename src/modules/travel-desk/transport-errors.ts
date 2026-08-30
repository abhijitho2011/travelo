import { HttpException, HttpStatus } from '@nestjs/common';

export function transportError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const TransportErrors = {
  requestNotFound: () =>
    transportError('TRANSPORT_REQUEST_NOT_FOUND', 'Transport request not found', HttpStatus.NOT_FOUND),
  vehicleNotFound: () =>
    transportError('VEHICLE_NOT_FOUND', 'Vehicle not found', HttpStatus.NOT_FOUND),

  duplicatePlate: () =>
    transportError('DUPLICATE_PLATE', 'A vehicle with that plate already exists', HttpStatus.CONFLICT),

  invalidTransportTransition: (from: string, to: string) =>
    transportError(
      'INVALID_TRANSPORT_TRANSITION',
      `A transport request cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  invalidDriverStep: (from: string, to: string) =>
    transportError(
      'INVALID_DRIVER_STEP',
      `A trip cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  /** Assigning needs a driver (and optionally a vehicle) to hand the trip to. */
  driverRequired: () =>
    transportError(
      'DRIVER_REQUIRED',
      'Assigning a transport request needs a driver',
      HttpStatus.BAD_REQUEST,
    ),

  /** The driver's own trip guard: a driver may only act on trips assigned to them. */
  notYourTrip: () =>
    transportError('TRANSPORT_REQUEST_NOT_FOUND', 'Transport request not found', HttpStatus.NOT_FOUND),

  notAssignable: () =>
    transportError(
      'TRANSPORT_NOT_ASSIGNABLE',
      'Only a requested or assigned trip can be (re)assigned',
      HttpStatus.CONFLICT,
    ),
};
