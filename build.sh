#!/bin/bash
mv install-wip.rdf install.rdf
7z a -tzip nzbdstatus.xpi * -r -mx=9 -xr\!.svn -x\!\*.bat -x\!\*.sh -x\!\*.xpi
mv install.rdf install-wip.rdf
