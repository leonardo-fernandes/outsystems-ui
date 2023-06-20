// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace OSFramework.OSUI.Feature.Balloon {
	// Type for the Balllon Feature options
	export type BalloonOptions = {
		alignment: GlobalEnum.FloatingAlignment;
		allowedPlacements: Array<GlobalEnum.FloatingPosition>;
		anchorElem: HTMLElement;
		position: GlobalEnum.FloatingPosition;
		shape: GlobalEnum.ShapeTypes;
	};

	/**
	 * Class for the Balloon Feature
	 *
	 * @export
	 * @class Balloon
	 * @extends {AbstractFeature<PT, BalloonOptions>}
	 * @implements {IBalloon}
	 * @template PT
	 */
	export class Balloon<PT> extends AbstractFeature<PT, BalloonOptions> implements IBalloon {
		// Store the listener callbacks
		private _eventBodyClick: GlobalCallbacks.Generic;
		private _eventOnKeypress: GlobalCallbacks.Generic;
		// Store the Floating UI provider instance
		// eslint-disable-next-line @typescript-eslint/naming-convention
		private _floatingUIInstance: Providers.OSUI.Utils.FloatingUI;
		// Store the Floating UI provider options
		// eslint-disable-next-line @typescript-eslint/naming-convention
		private _floatingUIOptions: Providers.OSUI.Utils.FloatingUIOptions;
		// FocusTrap Properties
		private _focusTrapInstance: Behaviors.FocusTrap;
		private _focusableActiveElement: HTMLElement;
		// Flag used to deal with onBodyClick and open api concurrency methods!
		private _isOpenedByApi = false;
		// Store the onTogle custom event
		private _onToggleEvent: GlobalCallbacks.Generic;
		// Store if the pattern is open
		public isOpen = false;

		constructor(featurePattern: PT, featureElem: HTMLElement, options: BalloonOptions) {
			super(featurePattern, featureElem, options);
			this.build();
		}

		// Method to handle the body click callback, that closes the Balloon
		private _bodyClickCallback(_args: string, e: MouseEvent): void {
			if (e.target === this.featureOptions?.anchorElem || this._isOpenedByApi) {
				return;
			}
			if (this.isOpen) {
				this._toggleBalloon(false, true);
				e.stopPropagation();
			}
		}

		// Add Focus Trap to the Pattern
		private _handleFocusTrap(): void {
			const opts = {
				focusTargetElement: this._floatingUIOptions.anchorElem.parentElement,
			} as Behaviors.FocusTrapParams;

			this._focusTrapInstance = new Behaviors.FocusTrap(opts);
		}

		// Call methods to open or close, based on e.key and behaviour applied
		private _onkeypressCallback(e: KeyboardEvent): void {
			const isEscapedPressed = e.key === GlobalEnum.Keycodes.Escape;

			// Close the Balloon when pressing Esc
			if (isEscapedPressed && this.isOpen) {
				this.close();
			}
		}

		// Method to remove the event listeners
		private _removeEventListeners(): void {
			this.featureElem.removeEventListener(GlobalEnum.HTMLEvent.keyDown, this._eventOnKeypress);
			Event.DOMEvents.Listeners.GlobalListenerManager.Instance.removeHandler(
				Event.DOMEvents.Listeners.Type.BodyOnClick,
				this._eventBodyClick
			);
		}

		// Add the Accessibility Attributes values
		// eslint-disable-next-line @typescript-eslint/naming-convention
		private _setA11YProperties(): void {
			Helper.Dom.Attribute.Set(this.featureElem, Constants.A11YAttributes.Aria.Hidden, (!this.isOpen).toString());

			// Will handle the tabindex value of the elements inside pattern
			Helper.A11Y.SetElementsTabIndex(this.isOpen, this._focusTrapInstance.focusableElements);

			Helper.Dom.Attribute.Set(
				this.featureElem,
				Constants.A11YAttributes.TabIndex,
				this.isOpen
					? Constants.A11YAttributes.States.TabIndexShow
					: Constants.A11YAttributes.States.TabIndexHidden
			);

			Helper.Dom.Attribute.Set(
				this._floatingUIOptions.anchorElem,
				Constants.A11YAttributes.TabIndex,
				this.isOpen
					? Constants.A11YAttributes.States.TabIndexHidden
					: Constants.A11YAttributes.States.TabIndexShow
			);
		}

		// Set the callbacks
		private _setCallbacks(): void {
			this._eventBodyClick = this._bodyClickCallback.bind(this);
			this._eventOnKeypress = this._onkeypressCallback.bind(this);

			// Set custom Balloon event
			this._onToggleEvent = function dispatchCustomEvent(isOpen, balloonElem) {
				const _customEvent = new CustomEvent(GlobalEnum.CustomEvent.BalloonOnToggle, {
					detail: { isOpen: isOpen, balloonElem: balloonElem },
				});
				document.dispatchEvent(_customEvent);
			};

			// Set its reference on the window
			if ((window[OSFramework.OSUI.GlobalEnum.CustomEvent.BalloonOnToggle] = undefined)) {
				window[OSFramework.OSUI.GlobalEnum.CustomEvent.BalloonOnToggle] =
					OSFramework.OSUI.GlobalEnum.CustomEvent.BalloonOnToggle;
			}
		}

		//  Method to add event listeners
		private _setEventListeners(): void {
			this.featureElem.addEventListener(GlobalEnum.HTMLEvent.keyDown, this._eventOnKeypress);

			if (this.isOpen) {
				Event.DOMEvents.Listeners.GlobalListenerManager.Instance.addHandler(
					Event.DOMEvents.Listeners.Type.BodyOnClick,
					this._eventBodyClick
				);
			}
		}

		// Method to toggle the open/close the Balloon
		private _toggleBalloon(isOpen: boolean, isBodyClick = false): void {
			// Update property
			this.isOpen = isOpen;

			// Toggle class
			if (isOpen) {
				Helper.Dom.Styles.AddClass(this.featureElem, Enum.CssClasses.IsOpen);
				// Add event listeners. This is async to prevent unnecessary calls when clicking on triggers
				Helper.AsyncInvocation(this._setEventListeners.bind(this));
			} else {
				Helper.Dom.Styles.RemoveClass(this.featureElem, Enum.CssClasses.IsOpen);
				// remove listeners and A11y properties
				this._removeEventListeners();
			}

			// Update A11y attributes
			this._setA11YProperties();

			if (this.isOpen) {
				// Handle focus trap logic
				this._focusableActiveElement = document.activeElement as HTMLElement;
				this._focusTrapInstance.enableForA11y();

				// Set FloatingUI
				this.setFloatingUIBehaviour();

				// Focus on element when pattern is open
				Helper.AsyncInvocation(() => {
					this.featureElem.focus();
				});
			} else {
				// Handle focus trap logic
				this._focusTrapInstance.disableForA11y();
				// Remove FloatingUI
				this._floatingUIInstance.close();
				// Focus on last element clicked. Async to avoid conflict with closing animation
				Helper.AsyncInvocation(() => {
					this.featureElem.blur();
					if (isBodyClick === false) {
						this._focusableActiveElement.focus();
					}
				});
			}

			// Trigger the Custom Event BalloonOnToggle
			this._onToggleEvent(this.isOpen, this.featureElem);

			// Delay the _isOpenedByApi assignement in order to deal with clickOnBody() and open() api concurrency!
			Helper.AsyncInvocation(() => {
				this._isOpenedByApi = false;
			});
		}

		// Method to unset the callbaks
		private _unsetCallbacks(): void {
			this._eventBodyClick = undefined;
			this._eventOnKeypress = undefined;
			this._onToggleEvent = undefined;
			window[OSFramework.OSUI.GlobalEnum.CustomEvent.BalloonOnToggle] = undefined;
		}

		/**
		 * Method to build the Feature
		 *
		 * @memberof Balloon
		 */
		public build(): void {
			this._setCallbacks();
			this._setEventListeners();
			this.setFloatingUIBehaviour();
			this._handleFocusTrap();
			this._setA11YProperties();
			this.setBalloonShape();
		}

		/**
		 * Method to close the Balloon
		 *
		 * @memberof Balloon
		 */
		public close(): void {
			if (this.isOpen) {
				this._toggleBalloon(false);
			}
		}

		/**
		 * Destroy the Balloon.
		 *
		 * @memberof Balloon
		 */
		public dispose(): void {
			this._floatingUIInstance.dispose();
			this._unsetCallbacks();
			super.dispose();
		}

		/**
		 * Method to open the Balloon
		 *
		 * @memberof Balloon
		 */
		public open(isOpenedByApi: boolean): void {
			if (this.isOpen === false) {
				this._isOpenedByApi = isOpenedByApi;
				this._toggleBalloon(true);
			}
		}

		/**
		 * Method to handle the Shape config css variable
		 *
		 * @param {GlobalEnum.ShapeTypes} [shape]
		 * @memberof Balloon
		 */
		public setBalloonShape(shape?: GlobalEnum.ShapeTypes): void {
			if (shape !== undefined) {
				this.featureOptions.shape = shape;
			}

			Helper.Dom.Styles.SetStyleAttribute(
				this.featureElem,
				Enum.CssCustomProperties.Shape,
				'var(--border-radius-' + this.featureOptions.shape + ')'
			);
		}

		/**
		 * Method to set the FloatingUI provider instance
		 *
		 * @param {boolean} [isUpdate]
		 * @memberof Balloon
		 */
		public setFloatingUIBehaviour(isUpdate?: boolean): void {
			if (isUpdate || this._floatingUIInstance === undefined) {
				this.setFloatingUIOptions();

				if (isUpdate && this._floatingUIInstance !== undefined) {
					this._floatingUIInstance.update(this._floatingUIOptions);
				}

				this._floatingUIInstance = new Providers.OSUI.Utils.FloatingUI(this._floatingUIOptions);
			} else {
				this._floatingUIInstance.build();
			}
		}

		/**
		 * Method to set the FloatingUI options
		 *
		 * @memberof Balloon
		 */
		public setFloatingUIOptions(): void {
			this._floatingUIOptions = {
				autoPlacement: this.featureOptions.position === GlobalEnum.FloatingPosition.Auto,
				anchorElem: this.featureOptions.anchorElem,
				autoPlacementOptions: {
					alignment: this.featureOptions.alignment,
					allowedPlacements: this.featureOptions.allowedPlacements,
				},
				floatingElem: this.featureElem,
				position: this.featureOptions.position,
				updatePosition: true,
			};
		}

		/**
		 * Method to update the FloatingUI options
		 *
		 * @param {Providers.OSUI.Utils.FloatingUIOptions} [floatingUIOptions]
		 * @memberof Balloon
		 */
		public updateFloatingUIOptions(floatingUIOptions?: Providers.OSUI.Utils.FloatingUIOptions): void {
			if (floatingUIOptions !== undefined) {
				this._floatingUIOptions = floatingUIOptions;
			}

			this.setFloatingUIBehaviour(true);
		}

		/**
		 * Method to update the Position config on the FloatingUI
		 *
		 * @param {GlobalEnum.FloatingPosition} position
		 * @memberof Balloon
		 */
		public updatePositionOption(position: GlobalEnum.FloatingPosition): void {
			this.featureOptions.position = position;
			this.setFloatingUIBehaviour(true);
		}
	}
}
