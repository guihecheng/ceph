import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';

import * as _ from 'lodash';
import { Observable, of as observableOf, timer as observableTimer } from 'rxjs';
import { map, switchMapTo, take } from 'rxjs/operators';

export function isEmptyInputValue(value: any): boolean {
  return value == null || value.length === 0;
}

export type existsServiceFn = (value: any) => Observable<boolean>;

export class CdValidators {
  /**
   * Validator that performs email validation. In contrast to the Angular
   * email validator an empty email will not be handled as invalid.
   */
  static email(control: AbstractControl): ValidationErrors | null {
    // Exit immediately if value is empty.
    if (isEmptyInputValue(control.value)) {
      return null;
    }
    return Validators.email(control);
  }

  /**
   * Validator that requires controls to fulfill the specified condition if
   * the specified prerequisites matches. If the prerequisites are fulfilled,
   * then the given function is executed and if it succeeds, the 'required'
   * validation error will be returned, otherwise null.
   * @param {Object} prerequisites An object containing the prerequisites.
   *   ### Example
   *   ```typescript
   *   {
   *     'generate_key': true,
   *     'username': 'Max Mustermann'
   *   }
   *   ```
   *   Only if all prerequisites are fulfilled, then the validation of the
   *   control will be triggered.
   * @param {Function | undefined} condition The function to be executed when all
   *   prerequisites are fulfilled. If not set, then the {@link isEmptyInputValue}
   *   function will be used by default. The control's value is used as function
   *   argument. The function must return true to set the validation error.
   * @return {ValidatorFn} Returns the validator function.
   */
  static requiredIf(prerequisites: Object, condition?: Function | undefined): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      // Check if all prerequisites matches.
      if (
        !Object.keys(prerequisites).every((key) => {
          return control.parent && control.parent.get(key).value === prerequisites[key];
        })
      ) {
        return null;
      }
      const success = _.isFunction(condition)
        ? condition.call(condition, control.value)
        : isEmptyInputValue(control.value);
      return success ? { required: true } : null;
    };
  }

  /**
   * Custom validation by passing a name for the error and a function as error condition.
   *
   * @param {string} error
   * @param {Function} condition - a truthy return value will trigger the error
   * @returns {ValidatorFn}
   */
  static custom(error: string, condition: Function): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } => {
      const value = condition.call(this, control.value);
      if (value) {
        return { [error]: value };
      }
      return null;
    };
  }

  /**
   * Validate form control if condition is true with validators.
   *
   * @param {AbstractControl} formControl
   * @param {Function} condition
   * @param {ValidatorFn[]} validators
   */
  static validateIf(formControl: AbstractControl, condition: Function, validators: ValidatorFn[]) {
    formControl.setValidators(
      (
        control: AbstractControl
      ): {
        [key: string]: any;
      } => {
        const value = condition.call(this);
        if (value) {
          return Validators.compose(validators)(control);
        }
        return null;
      }
    );
  }

  /**
   * Validator that requires that both specified controls have the same value.
   * Error will be added to the `path2` control.
   * @param {string} path1 A dot-delimited string that define the path to the control.
   * @param {string} path2 A dot-delimited string that define the path to the control.
   * @return {ValidatorFn} Returns a validator function that always returns `null`.
   *   If the validation fails an error map with the `match` property will be set
   *   on the `path2` control.
   */
  static match(path1: string, path2: string): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } => {
      const ctrl1 = control.get(path1);
      const ctrl2 = control.get(path2);
      if (ctrl1.value !== ctrl2.value) {
        ctrl2.setErrors({ match: true });
      } else {
        const hasError = ctrl2.hasError('match');
        if (hasError) {
          // Remove the 'match' error. If no more errors exists, then set
          // the error value to 'null', otherwise the field is still marked
          // as invalid.
          const errors = ctrl2.errors;
          _.unset(errors, 'match');
          ctrl2.setErrors(_.isEmpty(_.keys(errors)) ? null : errors);
        }
      }
      return null;
    };
  }

  /**
   * Asynchronous validator that requires the control's value to be unique.
   * The validation is only executed after the specified delay. Every
   * keystroke during this delay will restart the timer.
   * @param serviceFn {existsServiceFn} The service function that is
   *   called to check whether the given value exists. It must return
   *   boolean 'true' if the given value exists, otherwise 'false'.
   * @param serviceFnThis {any} The object to be used as the 'this' object
   *   when calling the serviceFn function. Defaults to null.
   * @param {number|Date} dueTime The delay time to wait before the
   *   serviceFn call is executed. This is useful to prevent calls on
   *   every keystroke. Defaults to 500.
   * @return {AsyncValidatorFn} Returns an asynchronous validator function
   *   that returns an error map with the `notUnique` property if the
   *   validation check succeeds, otherwise `null`.
   */
  static unique(
    serviceFn: existsServiceFn,
    serviceFnThis: any = null,
    dueTime = 500
  ): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      // Exit immediately if user has not interacted with the control yet
      // or the control value is empty.
      if (control.pristine || isEmptyInputValue(control.value)) {
        return observableOf(null);
      }
      // Forgot previous requests if a new one arrives within the specified
      // delay time.
      return observableTimer(dueTime).pipe(
        switchMapTo(serviceFn.call(serviceFnThis, control.value)),
        map((resp: boolean) => {
          if (!resp) {
            return null;
          } else {
            return { notUnique: true };
          }
        }),
        take(1)
      );
    };
  }
}
