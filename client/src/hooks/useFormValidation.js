import { useState, useCallback } from 'react';

/**
 * A generalized custom hook for form validation.
 * @param {Object} initialState - The initial values for the form fields.
 * @param {Object} validationRules - An object containing validation functions for each field.
 *   Format: { fieldName: (value, formState) => string | null }
 *   Example: { name: (val) => val.trim() ? null : 'Name is required' }
 */
export function useFormValidation(initialState, validationRules) {
    const [values, setValues] = useState(initialState);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    // Keep fields in sync with external updates if needed
    const setFieldValue = useCallback((field, value) => {
        setValues(prev => ({ ...prev, [field]: value }));

        // Clear error when user types if they previously had an error
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    }, [errors]);

    // Handle marking fields as touched (e.g., onBlur)
    const setFieldTouched = useCallback((field) => {
        setTouched(prev => ({ ...prev, [field]: true }));

        // Validate immediately on blur
        if (validationRules[field]) {
            const error = validationRules[field](values[field], values);
            setErrors(prev => ({ ...prev, [field]: error }));
        }
    }, [values, validationRules]);

    // Handle standard input change events
    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        const finalValue = type === 'checkbox' ? checked : value;
        setFieldValue(name, finalValue);
    }, [setFieldValue]);

    // Validate all fields
    const validateForm = useCallback(() => {
        const newErrors = {};
        let isValid = true;

        Object.keys(validationRules).forEach(field => {
            const error = validationRules[field](values[field], values);
            if (error) {
                newErrors[field] = error;
                isValid = false;
            }
        });

        setErrors(newErrors);

        // Mark all fields as touched to show errors
        const allTouched = Object.keys(validationRules).reduce((acc, field) => {
            acc[field] = true;
            return acc;
        }, {});
        setTouched(allTouched);

        return isValid;
    }, [values, validationRules]);

    const resetForm = useCallback((newValues = initialState) => {
        setValues(newValues);
        setErrors({});
        setTouched({});
    }, [initialState]);

    return {
        values,
        errors,
        touched,
        setValues,
        setFieldValue,
        setFieldTouched,
        handleChange,
        validateForm,
        resetForm
    };
}
