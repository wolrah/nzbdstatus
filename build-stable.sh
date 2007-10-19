#!/bin/bash
7z a -tzip nzbdstatus-stable.xpi * -r -mx=9 -xr\!.svn -x\!\*.bat -x\!\*.sh -x\!\*.xpi
