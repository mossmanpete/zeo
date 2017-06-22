## `entity` API

This API lets your `mod` register the kinds of entities that can be configured by users. You don't need to use this API to have a working mod, but you probably should use it if you want your mod to be configurable by users.

Basically, you call `registerEntity()` with a description of the typed attributes for your entity, how to create/destroy it, and how to respond to attribute changes. The engine will take care of the rest present the user the appropriate interface. 

All entities are first-class DOM elements, so they can see each other, send each other DOM events (e.g. `CustomEvent`), and read/write each other's attributes. As long as you follow the rules, it just works!

#### `registerEntity(this, spec)`

Call this to register an entity for your mod, from the perspective of the user. If you call this, it should be from your mod's `mount` function.

###### `this`

The first argument is the `this` value of your mod (the same `this` that your `mount` function is called with). This is used to track which entities belong to which mod, so it's required! You'll be passing `this` again when unregistering your entity on unmount.

###### `spec`

This should be an object with the following shape:

```
{
  attributes: {
    'attribute-1': {
      type: 'type',
      value: v,
    },
    'someOtherAttribute': {
      type: 'type',
      value: v,
    },
  },
  entityAddedCallback: entityElement => { /* ... */ },
  entityRemovedCallback: entityElement => { /* ... */ },
  entityAttributeValueChangedCallback: (entityElement, attributeName, oldValue, newValue) => { /* ... */ },
}
```

All keys are optional with sane defaults. But you should provide _something_, or else calling `registerEntity()` would be a bit silly.

- `attribute-1`, `someOtherAttribute`, etc.: These keys will be used as HTML attributes for you entity DOM elements, so should be [valid `HTML` attribute names](https://www.w3.org/TR/html/syntax.html#elements-attributes).
- `type`: Each attribute has a type. The valid types are described below.
- `value`: The _initial value_ for this attribute. The type of `value` depends on the attribute's declared `type`. Described below.
- `entityAddedCallback`: Called when your entity is added to the world. This is the place to add something to the VR world with the other APIs. `entityElement` is the DOM element for your entity, and can be used to interact with the entity DOM.
- `entityRemovedCallback`: Called when your entity is being removed from the world. This is where you should remove from the VR world whatever you added in `entityAddedCallback`.
- `entityAttributeValueChangedCallback`: Called when one of the attributes you declared changes. Receives the attribute name and its old/new values, in addition to the raw `entityElement`.

#### Attribute types

Every attribute has a `type`. There are types like `matrix`, `select`, and `color` that do not correspond to any Javascript type, but all values are represented with plain Javascript values like strings and arrays. Attributes values are stored as `JSON` strings on you entity's DOM element.

- `matrix` (`[0, 0, 0, 0, 0, 0, 1, 1, 1, 1]`): Represents a position in 3D space. It's a compressed 10-element form of the standard 4x4-element matrix. `[0-2]` is the _position_, `[3-6]` is the _quaternion_, and `[7-9]` is the _scale_.
- `vector` (`[0, 0, 0]`): Similar to `matrix`, except represents an arbitrary three-dimensional vector. Useful for sizes.
- `text` (`''`): An arbitrary string.
- `number` (`0`): An arbitrary number. Can be configured with extra options:
  - `min` (`0`): The minimum allowed value.
  - `max` (`10`): The maximum allowed value.
  - `step` (`1`): The increment to snap the value to. Should evenly divide both `min` and `max`.
- `select` (`''`): An string value selected from a list of allowable values. Can be configured with extra options:
  - `options` (`[]`): An array of strings specifying the allowed options.
- `checkbox` (`true`): A boolean value that can be `true` or `false`.
- `color` (`'#000000'`): A CSS-compatible color string. Can be any [fomat allowed by CSS](https://www.w3.org/TR/css3-color/#colorunits).
- `file`: (`''`): A URL representing a requestable file.

#### `unregisterEntity(this, spec)`

Should be called with the same arguments as `unregisterEntity()`.

Call this in the opposite place that you called `registerEntity`. For example, if you called `registerEntity` during `mount`, you should call `unregisterEntity` during `unmount`.

#### `getWorldElement()`

This returns the _root DOM element_ for the VR world. The children of this element are the loaded entity DOM elements &mdash; literally the elements you get passed in `entityAddedCallback`. This method is provided for convenience.

This allows entities to _talk to each other_. You can read and write to them using the [standard DOM APIs](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model) like `querySelector`, `getAttribute`, and `setAttribute`, send and listen for events ([`addEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener), [`CustomEvent`](https://developer.mozilla.org/en/docs/Web/API/CustomEvent)), and even use DOM libraries like [jQuery](https://jquery.com/).

Just note that when you're dealing with elements you're dealing with the local ones on your machine. If you want to share data with other clients, consider using the [`broadcast` API](/docs/api-broadcast).

#### Data storage

Loading and saving entities and their attributes happens automagically. Syncing between connected users is also automagic. &#x1F497;

This means if all your mods and their entities need to remember is some key-value pairs, you can use the DOM API and handle the attribute value change callbacks. Everything should just work.

If you need to store a larger piece of data, use a `file` attribute and store your data as an actual file on the backend. In that case file data won't be automatically synced to users (you'll have teach the code what you need), but since you're dealing with an actual file you can pack it with however much of whatever you want.

If you only need to signal other clients without storing anything, there's a whole nother [`broadcast` API](/docs/api-broadcast) for that.

Finally, if you need full control (for things like custom data streaming), you can use the power of server code! Uour mod's `server` file can start its own TCP/UDP/whatever, and the `client` sides can connect to it.