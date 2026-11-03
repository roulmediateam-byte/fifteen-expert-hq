# data/fake-claims

Owner: Melvin, with Marvin (file format and tests).

What goes here: made-up claims for testing the appeal pipeline and the review screen, including the 50-claim week 3 test set with planted errors (wrong code, missing record, unsupported clinical statement, missed deadline).

Every file is marked FAKE:
- the file name starts with fake-, for example fake-claim-001.json;
- the first line or first field says FAKE, for example "FAKE: made-up claim for testing, not a real patient";
- every name and ID inside is plainly invented, for example patient "FAKE Patient 001", member ID FAKE-0001.

Never start from a real claim, even with details changed.
