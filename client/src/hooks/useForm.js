import { useState, useCallback, useEffect } from 'react';

/**
 * A lightweight hook for handling form state and validation.
 * 
 * @param {Object} initialValues - Initial state of the form fields
 * @param {Function} validate - Optional function that returns an errors object based on values
 * @param {boolean} validateOnChange - Whether to validate on every change (detail: true) or only on blur/submit (default: false)
 */
export function useForm(initialValues = {}, validate, validateOnChange = false) {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form when initialValues change deeply (simple JSON check)
    useEffect(() => {
        setValues(initialValues);
        setErrors({});
        setTouched({});
    }, [JSON.stringify(initialValues)]);

    const handleChange = useCallback((e) => {
        // Handle both native events and direct value updates (if we pass simple values)
        const name = e.target ? e.target.name : null;
        const value = e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;

        // Return early if we can't determine name (unless it's a direct setter call strategy, but let's stick to event-like or (name, value) sig)
        if (!name) return;

        setValues(prev => {
            const newValues = { ...prev, [name]: value };

            if (validate && validateOnChange) {
                const validationErrors = validate(newValues);
                setErrors(validationErrors);
            } else if (errors[name]) {
                // Clear specific error when modified if not validating everything
                setErrors(prevErr => {
                    const newErr = { ...prevErr };
                    delete newErr[name];
                    return newErr;
                });
            }
            return newValues;
        });
    }, [validate, validateOnChange, errors]);

    // Manual setter for custom components (like Select, DatePicker)
    const setFieldValue = useCallback((name, value) => {
        setValues(prev => {
            const newValues = { ...prev, [name]: value };
            if (validate && validateOnChange) {
                setErrors(validate(newValues));
            }
            return newValues;
        });
    }, [validate, validateOnChange]);

    const handleBlur = useCallback((e) => {
        const { name } = e.target;
        setTouched(prev => ({ ...prev, [name]: true }));

        if (validate) {
            const validationErrors = validate(values);
            setErrors(validationErrors);
        }
    }, [values, validate]);

    const handleBlurField = useCallback((name) => {
        setTouched(prev => ({ ...prev, [name]: true }));
        if (validate) {
            setErrors(validate(values));
        }
    }, [values, validate]);

    const handleSubmit = useCallback((onSubmit) => async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setIsSubmitting(true);
        setTouched(
            Object.keys(values).reduce((acc, key) => ({ ...acc, [key]: true }), {})
        );

        const validationErrors = validate ? validate(values) : {};
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length === 0) {
            try {
                await onSubmit(values);
            } catch (error) {
                console.error("Form submission error", error);
            }
        }
        setIsSubmitting(false);
    }, [values, validate]);

    const resetForm = useCallback(() => {
        setValues(initialValues);
        setErrors({});
        setTouched({});
        setIsSubmitting(false);
    }, [initialValues]);

    return {
        values,
        errors,
        touched,
        handleChange,
        handleBlur,
        handleBlurField,
        handleSubmit,
        resetForm,
        setFieldValue,
        isSubmitting,
        isValid: Object.keys(errors).length === 0
    };
}
